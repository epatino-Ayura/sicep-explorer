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
      const fila = MES.map((_, i) => m[`${a}-${String(i + 1).padStart(2, "0")}`] ?? null);
      const s = fila.reduce((x, y) => x + (y || 0), 0); tot += s;
      f.push([a, ...fila, s]);
    });
    f.push([], ["Total del contrato (MWh)", tot], ["Total del anexo (MWh)", ctx.r.total_mwh],
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
    f.push(["Año", "MWh", "Costo a bolsa (COP)", "Costo a precio adjudicado (COP)", "Diferencia (COP)", "Precio bolsa de la curva ($/kWh)"]);
    [...ctx.costo.filas, ctx.costo.total].forEach((x) =>
      f.push([x.anio, x.mwh, x.costo_bolsa, x.costo_adjudicado ?? "Sin adjudicar", x.diferencia ?? "—", x.precio_bolsa_curva]));
    return f;
  }

  function hojaNotas(ctx) {
    const n = [
      ["Cómo se calculó"],
      ["Demanda horaria: la energía de cada mes del anexo se reparte entre sus días y horas según el perfil horario del año y el tipo de día (laborable, sábado, domingo/festivo, festivos de Colombia). La suma de cada mes es exactamente la del anexo."],
      ["Hora 1 = 00:00–00:59 (convención XM)."],
      ["Precio de bolsa de referencia: promedio horario de los últimos 12 meses disponibles por tipo de día (datos XM)."],
      ["Costos en pesos constantes, sin indexar. Costo = MWh × 1.000 × precio ($/kWh)."],
      ["Tarifa: solo el precio adjudicado publicado por SICEP y la indexación tal como la publica el pliego."],
      [],
    ];
    (ctx.dem ? ctx.dem.notas : []).concat(ctx.costo ? ctx.costo.notas : []).forEach((x) => n.push([x]));
    avisos(ctx).forEach((x) => n.push(["Aviso: " + x]));
    n.push([], ["Generado desde SICEP Explorer con datos públicos de SICEP y XM. Verifique en el pliego oficial."]);
    return n;
  }

  async function excel(ctx) {
    await cargarScript(CDN.xlsx);
    const X = window.XLSX, wb = X.utils.book_new();
    const hojas = [hojaResumen, hojaDemanda, hojaMeses, hojaTarifa, hojaBolsa, hojaNotas];
    hojas.forEach((fn, i) => {
      const ws = X.utils.aoa_to_sheet(fn(ctx));
      ws["!cols"] = i === 1 ? [{wch: 12}, {wch: 6}, {wch: 13}, {wch: 14}, {wch: 12}] : [{wch: 32}, {wch: 40}, {wch: 50}];
      X.utils.book_append_sheet(wb, ws, HOJAS[i]);
    });
    X.writeFile(wb, `${ctx.nombreBase}.xlsx`, {compression: true});
  }

  window.ProductoExport = Object.assign(window.ProductoExport || {}, {cargarScript, datos, contexto, excel, HOJAS, CDN, avisos, nf, franja, conPag});
})();
