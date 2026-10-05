// producto_export.js — PDF gerencial y Excel por producto, generados en el navegador al hacer clic.
(function () {
  "use strict";
  const C = window.ProductoCalc;
  const CDN = {
    xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  };
  const HOJAS = ["Resumen", "Demanda horaria", "MWh mes y año", "Tarifa", "Bolsa", "Notas"];
  const CURVA = {plana_24h: "Plana 24 h", plana_franja: "Plana en franja", variable: "Variable"};
  const nf = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("es-CO", {minimumFractionDigits: d, maximumFractionDigits: d}));
  const pesos = (v, d = 0) => (v == null ? "—" : (v < 0 ? "-$ " : "$ ") + nf(Math.abs(v), d));
  const ahorro = (x) => (x.costo_adjudicado == null ? null : x.costo_bolsa - x.costo_adjudicado);
  const NOTA_AHORRO = "Ahorro positivo = el precio adjudicado resulta más barato que la bolsa de referencia. Ambos costos se calculan sobre el 100 % de la demanda del anexo, no sobre la cantidad adjudicada.";
  const NOTA_IDX = "Precios sin indexar: precio adjudicado en pesos de su mes base; bolsa en pesos corrientes de los últimos 12 meses.";
  const mwh3 = (v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
  const cop0 = (v) => (typeof v === "number" ? Math.round(v) : v);
  const franja = (h) => `${String(h - 1).padStart(2, "0")}:00–${String(h - 1).padStart(2, "0")}:59`;
  const conPag = (x) => (x && x.v ? `${x.v}${x.pag != null ? ` (pliego p. ${x.pag})` : ""}` : "No indicado en el pliego");

  const scripts = {};
  function cargarScript(url) {
    if (scripts[url]) return scripts[url];
    scripts[url] = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = url; s.async = true;
      s.onload = () => ok();
      s.onerror = () => { s.remove(); delete scripts[url]; mal(new Error("No se pudo cargar " + url)); };
      document.head.appendChild(s);
    });
    return scripts[url];
  }

  const cache = {};
  function datos(base) {
    if (!cache[base]) {
      const get = (u) => fetch(base + u).then((r) => { if (!r.ok) throw new Error("No disponible: " + u); return r.json(); });
      cache[base] = Promise.all([get("festivos.json"), get("bolsa.json")])
        .then(([f, b]) => ({festivos: f.fechas || [], bolsa: b}))
        .catch((e) => { delete cache[base]; throw e; });
    }
    return cache[base];
  }

  function contexto(conv, productos, paquete, n, extra) {
    const r = C.resumenProducto(conv, productos, paquete, n);
    const q = ((paquete && paquete.cantidades && paquete.cantidades.productos) || {})[String(n)] || null;
    const tieneCant = !!(q && q.total_mwh);
    const dem = tieneCant ? C.demandaHoraria(q, extra.festivos, r.obligacion) : null;
    const ref = C.referenciaBolsa(extra.bolsa, 365);
    const costo = dem ? C.costoComparado(dem, ref, r.precio) : null;
    return {r, q, dem, ref, costo, nombreBase: r.codigo};
  }

  function avisos(ctx) {
    const a = [];
    if (ctx.r.estado_cantidades === "parcial") a.push("Cantidades del anexo: parcial (revisar).");
    ctx.r.descartes.forEach((d) => a.push(d));
    if (ctx.dem && ctx.dem.mwh_fuera_obligacion > 0) (ctx.dem.notas || []).filter((x) => x.includes("fuera del periodo")).forEach((x) => a.push(x));
    if (!ctx.dem) a.push("El anexo no trae cantidades para este producto: no hay demanda horaria ni comparación con bolsa.");
    return a;
  }

  function hojaResumen(ctx) {
    const r = ctx.r;
    const filas = [
      ["Campo", "Valor", "¿Qué es?"],
      ["Convocatoria", r.conv, "Código SICEP de la convocatoria"],
      ["Producto", `${r.nombre} (${r.codigo})`, "Producto dentro de la convocatoria"],
      ["Comprador", r.comprador, "Agente que compra la energía"],
      ["Mercado", r.mercado, "Regulado o no regulado"],
      ["Estado", r.estado, "Estado en SICEP"],
      ["FNCER", r.fncer ? "Sí" : "No", "Exclusiva para fuentes no convencionales de energía renovable"],
      ["Periodo", r.periodo || (r.obligacion ? `${r.obligacion.inicio} a ${r.obligacion.fin}` : "—"), "Periodo de suministro"],
      ["Tipo de curva", (CURVA[r.tipo_curva] || r.tipo_curva || "—") + (r.franja ? ` (${r.franja})` : ""), "Forma de la demanda horaria"],
      ["Horario", r.horario || "—", "Horas de entrega según el pliego"],
      ["Tipo de contrato", r.tipo_contrato || "—", "Modalidad del contrato"],
      ["MWh totales (anexo)", r.total_mwh, "Suma del anexo de cantidades del pliego"],
      ["GWh demandados (SICEP)", r.demandada_gwh, "Cantidad publicada por SICEP"],
      ["GWh adjudicados (SICEP)", r.adjudicada_gwh, "Cantidad adjudicada publicada por SICEP"],
      ["% adjudicado", r.pct_adjudicado, "Adjudicado / demandado"],
      ["Precio adjudicado ($/kWh)", r.precio == null ? "Sin adjudicar" : r.precio, "Precio promedio adjudicado publicado por SICEP"],
      ["Estado de cantidades", r.estado_cantidades || "—", "ok = el anexo cuadra con SICEP; parcial = revisar avisos"],
    ];
    avisos(ctx).forEach((a) => filas.push(["Aviso", a, ""]));
    return filas;
  }

  function hojaDemanda(ctx) {
    if (!ctx.dem) return [["Sin demanda horaria: el anexo no trae cantidades para este producto."]];
    const d = ctx.dem, f = [["Fecha", "Hora", "Franja", "Tipo de día", "MWh"]];
    for (let i = 0; i < d.fecha.length; i++) f.push([d.fecha[i], d.hora[i], franja(d.hora[i]), d.tipo[i], d.mwh[i]]);
    return f;
  }

  function hojaMeses(ctx) {
    if (!ctx.dem) return [["Sin datos mensuales."]];
    const m = C.mensualDesde(ctx.dem), anios = [...new Set(Object.keys(m).map((k) => k.slice(0, 4)))].sort();
    const MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const f = [["Año", ...MES, "Total"]];
    let tot = 0;
    anios.forEach((a) => {
      const fila = MES.map((_, i) => mwh3(m[`${a}-${String(i + 1).padStart(2, "0")}`] ?? null));
      const s = fila.reduce((x, y) => x + (y || 0), 0); tot += s;
      f.push([a, ...fila, mwh3(s)]);
    });
    f.push([], ["Total del contrato (MWh)", mwh3(tot)], ["Total del anexo (MWh)", mwh3(ctx.r.total_mwh)],
           ["GWh demandados SICEP", ctx.r.demandada_gwh]);
    return f;
  }

  function hojaTarifa(ctx) {
    const r = ctx.r, ix = r.indexacion;
    const pag = (k) => (ix.pag && ix.pag[k] != null ? ` (pliego p. ${ix.pag[k]})` : "");
    return [
      ["Concepto", "Valor"],
      ["Precio adjudicado SICEP ($/kWh)", r.precio == null ? "Sin adjudicar" : r.precio],
      ["Moneda base", r.moneda_base || "No indicado en el pliego"],
      ["Indexación · índice", (ix.indice || "No indicado en el pliego") + pag("indice")],
      ["Indexación · periodicidad", (ix.periodicidad || "No indicado en el pliego") + pag("periodicidad")],
      ["Indexación · base", (ix.base || "No indicado en el pliego") + pag("base")],
      [],
      ["Nota", "Se usa solo lo publicado: precio adjudicado de SICEP e indexación tal como la describe el pliego. No se proyecta la indexación."],
    ];
  }

  function hojaBolsa(ctx) {
    const ref = ctx.ref, f = [[`Precio de bolsa de referencia ($/kWh): promedio ${ref.desde} a ${ref.hasta}`],
      ["Hora", "Franja", "Laborable", "Sábado", "Domingo/festivo"]];
    for (let h = 1; h <= 24; h++) f.push([h, franja(h), ref.ordinario[h - 1], ref.sabado[h - 1], ref.festivo[h - 1]]);
    f.push([]);
    if (!ctx.costo) { f.push(["Sin comparación: el producto no tiene cantidades."]); return f; }
    f.push(["Año", "MWh", "Costo a bolsa (COP)", "Costo a precio adjudicado (COP)", "Ahorro frente a bolsa (COP)", "Precio bolsa de la curva ($/kWh)"]);
    [...ctx.costo.filas, ctx.costo.total].forEach((x) =>
      f.push([x.anio, mwh3(x.mwh), cop0(x.costo_bolsa), cop0(x.costo_adjudicado ?? "Sin adjudicar"), cop0(ahorro(x) ?? "—"), x.precio_bolsa_curva]));
    f.push([], [NOTA_AHORRO]);
    return f;
  }

  function hojaNotas(ctx) {
    const n = [
      ["Cómo se calculó"],
      ["Demanda horaria: la energía de cada mes del anexo se reparte entre sus días y horas según el perfil horario del año y el tipo de día (laborable, sábado, domingo/festivo, festivos de Colombia). La suma de cada mes es exactamente la del anexo."],
      ["Hora 1 = 00:00–00:59 (convención XM)."],
      ["Precio de bolsa de referencia: promedio horario de los últimos 12 meses disponibles por tipo de día (datos XM)."],
      [NOTA_IDX + " Costo = MWh × 1.000 × precio ($/kWh)."],
      [NOTA_AHORRO],
      ["Tarifa: solo el precio adjudicado publicado por SICEP y la indexación tal como la publica el pliego."],
      [],
    ];
    const av0 = avisos(ctx);
    (ctx.dem ? ctx.dem.notas.filter((x) => !av0.includes(x)) : []).concat(ctx.costo ? ctx.costo.notas : []).forEach((x) => n.push([x]));
    avisos(ctx).forEach((x) => n.push(["Aviso: " + x]));
    n.push([], ["Generado desde SICEP Explorer con datos públicos de SICEP y XM. Verifique en el pliego oficial."]);
    return n;
  }

  // Aplica un formato numérico a un rango A1 (solo celdas numéricas).
  function formato(X, ws, rango, z) {
    const r = X.utils.decode_range(rango);
    for (let R = r.s.r; R <= r.e.r; R++) for (let c = r.s.c; c <= r.e.c; c++) {
      const cel = ws[X.utils.encode_cell({r: R, c})];
      if (cel && cel.t === "n") cel.z = z;
    }
  }

  async function excel(ctx) {
    await cargarScript(CDN.xlsx);
    if (!window.XLSX) throw new Error("No se pudo cargar la librería SheetJS");
    const X = window.XLSX, wb = X.utils.book_new();
    const hojas = [hojaResumen, hojaDemanda, hojaMeses, hojaTarifa, hojaBolsa, hojaNotas];
    hojas.forEach((fn, i) => {
      const ws = X.utils.aoa_to_sheet(fn(ctx));
      if (i === 1) Object.keys(ws).forEach((k) => { if (/^E\d+$/.test(k) && k !== "E1" && ws[k].t === "n") ws[k].z = "0.000"; });
      if (i === 0) { formato(X, ws, "B12:B14", "#,##0.000"); formato(X, ws, "B16", "#,##0.00"); }
      if (i === 2) formato(X, ws, "B2:N40", "#,##0.000");
      if (i === 3) formato(X, ws, "B2", "#,##0.00");
      if (i === 4) {
        formato(X, ws, "C3:E26", "#,##0.00");
        if (ctx.costo) {
          const u = 29 + ctx.costo.filas.length;   // fila de Total (1-based)
          formato(X, ws, `B29:B${u}`, "#,##0.000"); formato(X, ws, `C29:E${u}`, "#,##0"); formato(X, ws, `F29:F${u}`, "#,##0.00");
        }
      }
      ws["!cols"] = i === 1 ? [{wch: 12}, {wch: 6}, {wch: 13}, {wch: 14}, {wch: 12}] : i === 4 ? [{wch: 14}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 18}] : [{wch: 32}, {wch: 40}, {wch: 50}];
      X.utils.book_append_sheet(wb, ws, HOJAS[i]);
    });
    X.writeFile(wb, `${ctx.nombreBase}.xlsx`, {compression: true});
  }

  function imagenGrafico(opcion) {
    if (typeof window.echarts === "undefined") return null;
    const div = document.createElement("div");
    div.style.cssText = "position:fixed;left:-10000px;top:0;width:640px;height:280px";
    document.body.appendChild(div);
    try {
      const g = window.echarts.init(div, null, {renderer: "canvas"});
      g.setOption(Object.assign({animation: false, textStyle: {fontSize: 20}, grid: {left: 100, right: 24, top: 70, bottom: 44}}, opcion));
      const url = g.getDataURL({type: "jpeg", pixelRatio: 2, backgroundColor: "#ffffff"});
      g.dispose();
      return url;
    } catch (e) { return null; } finally { div.remove(); }
  }

  async function pdf(ctx) {
    await cargarScript(CDN.jspdf);
    await cargarScript(CDN.autotable);
    if (!window.jspdf) throw new Error("No se pudo cargar la librería jsPDF");
    const {jsPDF} = window.jspdf, T = C.pdfTxt, r = ctx.r;
    const doc = new jsPDF({unit: "pt", format: "letter", compress: true});
    const W = doc.internal.pageSize.getWidth(), M = 40;
    let y = M;
    const titulo = (s) => { doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(T(s), M, y); y += 14; doc.setFont("helvetica", "normal"); };
    const tabla = (head, body, opts = {}) => {
      doc.autoTable(Object.assign({startY: y, head: head ? [head.map(T)] : undefined, body: body.map((f) => f.map((c) => T(c ?? "—"))),
        margin: {left: M, right: M}, styles: {fontSize: 8.5, cellPadding: 3, overflow: "linebreak"},
        headStyles: {fillColor: [31, 78, 121]}, theme: "grid"}, opts));
      y = doc.lastAutoTable.finalY + 12;
    };
    const salto = (alto) => { if (y + alto > doc.internal.pageSize.getHeight() - M) { doc.addPage(); y = M; } };

    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(T(`${r.conv} - ${r.nombre}`), M, y); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(T(`${r.comprador || "—"} | ${r.mercado || "—"} | ${r.estado || "—"} | FNCER: ${r.fncer ? "Sí" : "No"} | Generado ${new Date().toLocaleDateString("sv-SE")}`), M, y);
    y += 14;

    const av = avisos(ctx);
    if (av.length) {
      doc.setTextColor(160, 30, 30);
      doc.splitTextToSize(T("Avisos: " + av.join(" | ")), W - 2 * M).forEach((l) => { doc.text(l, M, y); y += 11; });
      doc.setTextColor(0); y += 4;
    }

    titulo("Cifras clave");
    tabla(null, [
      ["MWh totales (anexo)", nf(r.total_mwh), "Periodo", r.periodo || (r.obligacion ? `${r.obligacion.inicio} a ${r.obligacion.fin}` : "—")],
      ["Tipo de curva", (CURVA[r.tipo_curva] || r.tipo_curva || "—") + (r.franja ? ` (${r.franja})` : ""), "Horario", r.horario || "—"],
      ["Precio adjudicado", r.precio == null ? "Sin adjudicar" : `${pesos(r.precio, 2)} /kWh`, "% adjudicado", r.pct_adjudicado == null ? "—" : `${nf(r.pct_adjudicado, 1)} %`],
      ["Indexación", [r.indexacion.indice, r.indexacion.periodicidad, r.indexacion.base].filter(Boolean).join(" | ") || "No indicado en el pliego",
       "Tipo de contrato", r.tipo_contrato || "—"],
    ], {columnStyles: {0: {fontStyle: "bold", cellWidth: 95}, 2: {fontStyle: "bold", cellWidth: 85}, 3: {cellWidth: 150}}});

    if (ctx.dem) {
      const anual = C.anualDesde(ctx.dem), anios = Object.keys(anual).sort();
      const fmtEje = {axisLabel: {fontSize: 18, formatter: (v) => Number(v).toLocaleString("es-CO")}};
      const img1 = imagenGrafico({title: {text: "MWh por año", left: "left", textStyle: {fontSize: 22}},
        xAxis: {type: "category", data: anios, axisLabel: {fontSize: 18}}, yAxis: Object.assign({type: "value"}, fmtEje), series: [{type: "bar", data: anios.map((a) => Math.round(anual[a])), itemStyle: {color: "#1f4e79"}}]});
      const P = (ctx.q.perfiles && ctx.q.perfiles[anios[0]]) || ctx.q.perfil || {};
      const img2 = imagenGrafico({title: {text: "Curva horaria típica (MWh/h)", left: "left", textStyle: {fontSize: 22}},
        legend: {top: 34, left: "left", textStyle: {fontSize: 18}, itemWidth: 24, itemHeight: 12}, xAxis: {type: "category", data: [...Array(24).keys()].map((h) => "H" + (h + 1)), axisLabel: {fontSize: 18, interval: 3}}, yAxis: Object.assign({type: "value"}, fmtEje),
        series: Object.entries(P).map(([t, v]) => ({type: "line", name: t, data: v, showSymbol: false}))});
      const ancho = (W - 2 * M - 10) / 2, alto = ancho * 280 / 640;
      salto(alto + 10);
      if (img1) doc.addImage(img1, "JPEG", M, y, ancho, alto, undefined, "FAST");
      if (img2) doc.addImage(img2, "JPEG", M + ancho + 10, y, ancho, alto, undefined, "FAST");
      if (img1 || img2) y += alto + 12; else { doc.setFontSize(8); doc.text(T("Gráficas no disponibles (ECharts no cargó)."), M, y); y += 12; }

      salto(120);
      titulo("Comparación con bolsa");
      doc.setFontSize(8);
      doc.text(T(`Precio de bolsa de referencia: promedio horario ${ctx.ref.desde} a ${ctx.ref.hasta} por tipo de día. ${NOTA_IDX}`), M, y); y += 8;
      tabla(["Año", "MWh", "Costo a bolsa", "Costo a precio adjudicado", "Ahorro frente a bolsa", "Bolsa de la curva $/kWh"],
        [...ctx.costo.filas, ctx.costo.total].map((x) => [x.anio, nf(x.mwh), pesos(x.costo_bolsa),
          x.costo_adjudicado == null ? "Sin adjudicar" : pesos(x.costo_adjudicado), pesos(ahorro(x)),
          nf(x.precio_bolsa_curva, 2)]));
      doc.setFontSize(8); doc.setFont("helvetica", "italic");
      doc.splitTextToSize(T(NOTA_AHORRO), W - 2 * M).forEach((l) => { salto(10); doc.text(l, M, y); y += 10; });
      doc.setFont("helvetica", "normal"); y += 4;
    } else {
      doc.setFontSize(9); doc.text(T("El anexo no trae cantidades para este producto: sin gráficas ni comparación con bolsa."), M, y); y += 14;
    }

    salto(80);
    titulo("Condiciones clave del pliego");
    const cond = ctx.r.condiciones;
    const filas = [...cond.garantias, ...cond.penalidades, cond.criterio, ...cond.especiales].filter((x) => x && x.v)
      .map((x) => [x.t, x.v.length > 400 ? x.v.slice(0, 397) + "..." : x.v, x.pag != null ? `p. ${x.pag}` : "—"]);
    tabla(["Tema", "Condición", "Pliego"], filas.length ? filas : [["—", "No indicado en el pliego", "—"]],
      {columnStyles: {0: {cellWidth: 95, fontStyle: "bold"}, 2: {cellWidth: 40}}});

    doc.setFontSize(7.5); doc.setTextColor(90);
    const pie = T("Generado desde SICEP Explorer con datos públicos de SICEP y XM. Verifique en el pliego oficial.");
    for (let i = 1; i <= doc.getNumberOfPages(); i++) { doc.setPage(i); doc.text(pie, M, doc.internal.pageSize.getHeight() - 20); }
    doc.save(`${ctx.nombreBase}-resumen.pdf`);
  }

  function activarExport(el, d) {
    if (!el || el._expActivo) { if (el) el._expDatos = d; return; }
    el._expActivo = true; el._expDatos = d;
    el.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button.exp");
      if (!btn || btn.disabled || !el.contains(btn)) return;
      const D = el._expDatos, n = Number(btn.dataset.n), fmt = btn.dataset.fmt;
      const msg = btn.parentElement.querySelector(".exp-msg"), texto = btn.textContent;
      btn.disabled = true; btn.textContent = "Generando…"; if (msg) msg.textContent = "";
      try {
        const extra = await datos(D.base || "data/");
        await new Promise((ok) => setTimeout(ok, 0));   // deja pintar "Generando…"
        const ctx = contexto(D.conv, D.productos, D.paquete, n, extra);
        await (fmt === "pdf" ? pdf(ctx) : excel(ctx));
      } catch (e) {
        console.error(e);
        if (msg) msg.textContent = (e && e.message && e.message.startsWith("No se pudo")) ? e.message.replace(/ https?:\S+/, " la librería (sin conexión)") + ". Intente de nuevo."
          : "No se pudo generar el archivo: " + (e && e.message ? e.message : e);
      } finally { btn.disabled = false; btn.textContent = texto; }
    });
  }
  window.activarExport = activarExport;
  window.ProductoExport = Object.assign(window.ProductoExport || {}, {cargarScript, datos, contexto, excel, pdf, HOJAS, CDN, avisos, nf, franja, conPag});
})();
