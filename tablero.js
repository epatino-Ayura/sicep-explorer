// tablero.js — Tablero visual por convocatoria (sitio público y app local).
// renderTablero(el, {conv, productos, paquete, bolsa}); usa ECharts 5 si está cargado (window.echarts).
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const nf = (v, d) => v == null || isNaN(v) ? "—" : Number(v).toLocaleString("es", {minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always"});
  const fx = v => Number(v).toLocaleString("es", {maximumFractionDigits: 2, useGrouping: "always"});  // etiquetas de ejes
  const COL = {dem: "#B8C7D9", adj: "#2E6FB0", bolsa: "#C2410C", ink: "#1a1d21", muted: "#6b7280", line: "#e6e6e3"};
  const PALETA = ["#2E6FB0", "#1E8E5A", "#C2410C", "#7C3AED", "#B45309", "#0E7490", "#BE185D", "#64748B"];
  const FUENTE = 12;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const num = v => v == null || v === "" || isNaN(v) ? null : Number(v);
  const anio = s => s ? String(s).slice(0, 4) : "";
  const pLabel = p => { const m = /(\d+)\s*$/.exec(p || ""); return m ? "P" + Number(m[1]) : String((p || "").split("-").pop()); };
  const pNum = p => { const m = /(\d+)\s*$/.exec(p || ""); return m ? String(Number(m[1])) : null; };
  const precioOk = p => { const v = num(p.precio_prom_adjudicado); return v != null && v > 0 ? v : null; };  // SICEP publica 0 en productos sin adjudicar
  const compacto = v => Math.abs(v) >= 1e6 ? nf(v / 1e6, 1) + " M" : fx(v);

  const CSS = `
  .tb{margin:4px 0 22px}
  .tb .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:10px;margin-bottom:14px}
  .tb .kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 14px;min-width:0}
  .tb .kpi .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.02em}
  .tb .kpi .n{font-size:22px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}
  .tb .kpi .n.t{font-size:15px;line-height:1.35;padding-top:3px}
  .tb .kpi .s{font-size:12px;color:var(--muted)}
  .tb .kpi.plazo{border-color:#fdba74;background:#fff7ed}
  .tb .kpi.plazo .n{color:var(--warn,#C2410C)}
  .tb .roja{background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:9px 14px;margin-bottom:14px;color:#991b1b}
  .tb .roja ul{margin:4px 0 0;padding-left:18px}
  .tb .graficos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:14px}
  .tb .gc{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 10px 6px;min-width:0}
  .tb .gc h4{margin:0 6px 0;font-size:14px}
  .tb .gc .sub{margin:0 6px 4px;font-size:12px;color:var(--muted)}
  .tb .plot{width:100%;height:270px;overflow:hidden}
  .tb .graficos,.tb .gc{overflow:hidden}
  .tb .aviso{margin:0 6px 8px;padding:26px 10px;text-align:center;color:var(--muted);font-size:13px;background:#f8f8f6;border-radius:8px}
  .tb .filtro{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:-4px 0 14px}
  .tb .filtro .fl{font-size:12px;color:var(--muted);margin-right:4px}
  .tb .filtro button{border:1px solid var(--line);background:var(--surface);color:inherit;border-radius:999px;padding:4px 12px;font:inherit;font-size:13px;cursor:pointer}
  .tb .filtro button[aria-pressed="true"]{background:#2E6FB0;border-color:#2E6FB0;color:#fff}
  .tb .filtro select{border:1px solid var(--line);background:var(--surface);color:inherit;border-radius:8px;padding:3px 6px;font:inherit;font-size:13px}
  .tb .filtro .sep{width:1px;height:20px;background:var(--line);margin:0 4px}
  .tb .filtro .cargando{font-size:12px;color:var(--muted)}
  .tb .filtro .err{font-size:12px;color:#b3261e}
  .tb .aviso.gen{text-align:left;padding:10px 14px;margin:0 0 14px;background:#fff7ed;border:1px solid #fdba74;color:#7c2d12}
  `;

  function estilo() {
    if (document.getElementById("tablero-css")) return;
    const s = document.createElement("style");
    s.id = "tablero-css"; s.textContent = CSS; document.head.appendChild(s);
  }

  function diasFaltan(fecha) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha || "");
    if (!m) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - hoy) / 864e5);
  }

  // f = {sel: Set|null, total: n} cuando hay filtro de productos: las cifras salen de los productos marcados.
  function kpis(c, P, f) {
    const suma = k => P.reduce((s, p) => num(p[k]) == null ? s : (s ?? 0) + num(p[k]), null);
    const dem = f ? suma("energia_demandada_gwh") : num(c.energia_demandada_gwh);
    const adj = f ? suma("energia_adjudicada_gwh") : num(c.energia_adjudicada_gwh);
    const pct = dem && adj != null ? adj / dem * 100 : null;
    const k = (l, n, s, cls) => `<div class="kpi ${cls || ""}"><div class="l">${esc(l)}</div><div class="n ${/^t/.test(cls || "") ? "t" : ""}">${n}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
    const t = (l, v) => `<div class="kpi"><div class="l">${esc(l)}</div><div class="n t">${esc(v || "—")}</div></div>`;
    let ini = anio(c.inicio_suministro), fin = anio(c.fin_suministro), precio = num(c.precio_prom_ponderado);
    if (f) {
      const ii = P.map(p => anio(p.inicio_obligacion)).filter(Boolean).sort(), ff = P.map(p => anio(p.fin_obligacion)).filter(Boolean).sort();
      ini = ii[0] || ""; fin = ff[ff.length - 1] || "";
      let w = 0, sw = 0;
      P.forEach(p => { const v = precioOk(p), e = num(p.energia_adjudicada_gwh); if (v != null && e > 0) { w += e; sw += v * e; } });
      precio = w ? sw / w : null;
    }
    let plazo = "";
    if (c.estado === "Abierta" && c.fecha_limite_oferta) {
      const d = diasFaltan(c.fecha_limite_oferta);
      if (d != null) plazo = d < 0 ? k("Plazo de ofertas", "Vencido", "Plazo de ofertas vencido", "plazo")
        : k("Plazo de ofertas", d === 0 ? "Hoy" : nf(d, 0), d === 0 ? "vence hoy" : d === 1 ? "día para el límite de ofertas" : "días para el límite de ofertas", "plazo");
    }
    return `<div class="kpis">
      ${t("Estado", c.estado)}${t("Comprador", c.agente_comprador)}
      ${k("GWh demandados", nf(dem, 0))}
      ${k("GWh adjudicados", nf(adj, 0), pct == null ? "" : nf(pct, 0) + " % de lo demandado")}
      ${k("Precio adjudicado", precio == null ? "—" : "$ " + nf(precio, 2), "$/kWh, promedio ponderado")}
      ${f ? k("Productos", esc(P.length + " de " + f.total), "seleccionados") : k("Productos", esc(c.n_productos ?? P.length ?? "—"))}
      ${k("Suministro", ini && fin ? (ini === fin ? ini : ini + "–" + fin) : "—", "", "t")}
      ${plazo}</div>`;
  }

  function baseOpt() {
    return {
      textStyle: {fontSize: FUENTE},
      color: PALETA,
      grid: {left: 8, right: 14, top: 58, bottom: 8, containLabel: true},
      legend: {top: 2, textStyle: {fontSize: FUENTE, color: COL.ink}, itemWidth: 14, itemHeight: 10},
      tooltip: {trigger: "axis", confine: true, textStyle: {fontSize: FUENTE}, axisPointer: {type: "shadow"}},
    };
  }
  const eje = extra => Object.assign({axisLabel: {fontSize: FUENTE, color: COL.muted}, axisLine: {lineStyle: {color: COL.line}}}, extra);
  const valor = (name, extra) => eje(Object.assign({type: "value", name, axisLabel: {fontSize: FUENTE, color: COL.muted, formatter: fx}, nameTextStyle: {fontSize: FUENTE, color: COL.muted, align: "left"},
    splitLine: {lineStyle: {color: "#efefec"}}}, extra));

  // ---- definiciones de gráficos: devuelven {opt} o {aviso} o null (no mostrar) ----
  function gDemanda(P) {
    const ps = P.filter(p => num(p.energia_demandada_gwh) != null || num(p.energia_adjudicada_gwh) != null);
    if (!ps.length) return {aviso: "Aún sin productos publicados"};
    const nombres = ps.map(p => pLabel(p.producto));
    const o = baseOpt();
    o.xAxis = eje({type: "category", data: nombres});
    o.yAxis = valor("GWh");
    o.tooltip.valueFormatter = v => v == null ? "—" : nf(v, 2) + " GWh";
    o.series = [
      {name: "Demandado", type: "bar", data: ps.map(p => num(p.energia_demandada_gwh)), itemStyle: {color: COL.dem}, barMaxWidth: 34},
      {name: "Adjudicado", type: "bar", data: ps.map(p => num(p.energia_adjudicada_gwh)), itemStyle: {color: COL.adj}, barMaxWidth: 34}];
    return {opt: o};
  }

  function gAnual(paquete) {
    const prods = paquete && paquete.cantidades && paquete.cantidades.productos;
    const claves = prods ? Object.keys(prods).filter(k => prods[k] && prods[k].mwh_anual && Object.keys(prods[k].mwh_anual).length) : [];
    if (!claves.length) return {aviso: "Sin cantidades por año (anexo no reconocido)"};
    claves.sort((a, b) => a - b);
    const anios = [...new Set(claves.flatMap(k => Object.keys(prods[k].mwh_anual)))].sort();
    const o = baseOpt();
    o.xAxis = eje({type: "category", data: anios});
    o.yAxis = valor("MWh", {axisLabel: {fontSize: FUENTE, color: COL.muted, formatter: compacto}});
    o.tooltip.valueFormatter = v => v == null ? "—" : nf(v, 0) + " MWh";
    o.series = claves.map(k => ({name: "P" + Number(k), type: "bar", stack: "mwh", barMaxWidth: 38,
      itemStyle: {color: PALETA[(Number(k) - 1 + PALETA.length) % PALETA.length]}, data: anios.map(a => num(prods[k].mwh_anual[a]))}));  // color fijo por producto al filtrar
    return {opt: o};
  }

  function gCurva(paquete, bolsa, P, pers) {
    const prods = paquete && paquete.cantidades && paquete.cantidades.productos;
    const M = P.length;
    const claveSicep = new Set(P.map(p => pNum(p.producto)));
    const con = prods ? Object.entries(prods).filter(([k, p]) => (!M || claveSicep.has(String(k))) && p && p.perfil &&
      Object.values(p.perfil).some(a => Array.isArray(a) && a.length === 24)).map(([, p]) => p) : [];
    if (!con.length) return {aviso: prods && Object.keys(prods).length && M && !Object.keys(prods).some(k => claveSicep.has(String(k)))
      ? "Los productos del anexo no coinciden con los de SICEP" : "Sin perfil horario de demanda (anexo no reconocido)"};
    const valido = (p, t) => Array.isArray(p.perfil[t]) && p.perfil[t].length === 24;
    let tipo = "ordinario";
    if (!con.every(p => valido(p, tipo))) {
      const cuenta = {};
      con.forEach(p => Object.keys(p.perfil).forEach(t => { if (valido(p, t)) cuenta[t] = (cuenta[t] || 0) + 1; }));
      tipo = Object.keys(cuenta).sort((x, y) => cuenta[y] - cuenta[x] || (x === "ordinario" ? -1 : y === "ordinario" ? 1 : 0))[0];
    }
    const usados = con.filter(p => valido(p, tipo));
    const dem = new Array(24).fill(0);
    usados.forEach(p => p.perfil[tipo].forEach((v, h) => { dem[h] += num(v) || 0; }));
    const N = usados.length, total = Math.max(M, N);
    const DIA = {ordinario: "día ordinario", sabado: "sábado", festivo: "domingo/festivo", festivo_lunes: "lunes festivo"};
    const sub = `Suma de ${N} de ${total} productos · ${DIA[tipo] || tipo}` + (N < total ? " (los demás sin curva en el anexo)" : "");
    const bp = !pers && bolsa && Array.isArray(bolsa.perfil_12m) && bolsa.perfil_12m.length === 24 ? bolsa.perfil_12m : null;
    const horas = Array.from({length: 24}, (_, i) => i + 1);
    const o = baseOpt();
    o.grid.right = bp ? 8 : 14;
    o.xAxis = eje({type: "category", data: horas, name: "Hora", nameLocation: "middle", nameGap: 26,
      nameTextStyle: {fontSize: FUENTE, color: COL.muted}, boundaryGap: false,
      axisLabel: {fontSize: FUENTE, color: COL.muted, interval: 2}});
    o.grid.bottom = 26;
    o.yAxis = [valor("MWh/h", {axisLabel: {fontSize: FUENTE, color: COL.muted, formatter: v => nf(v, 0)}})];
    o.series = [{name: "Demanda (MWh/h)", type: "line", data: dem.map(v => +v.toFixed(3)), showSymbol: false, smooth: false,
      lineStyle: {width: 2.5, color: COL.adj}, itemStyle: {color: COL.adj}, areaStyle: {color: COL.adj, opacity: .08}}];
    if (bp) {
      o.yAxis.push(valor("$/kWh", {position: "right", splitLine: {show: false}, nameTextStyle: {fontSize: FUENTE, color: COL.bolsa, align: "right"},
        axisLabel: {fontSize: FUENTE, color: COL.bolsa, formatter: v => nf(v, 0)}}));
      o.series.push({name: "Bolsa 12 meses ($/kWh)", type: "line", yAxisIndex: 1, data: bp, showSymbol: false,
        lineStyle: {width: 2, color: COL.bolsa, type: "dashed"}, itemStyle: {color: COL.bolsa}});
    }
    if (pers && pers.length) {
      o.yAxis.push(valor("$/kWh", {position: "right", splitLine: {show: false}, nameTextStyle: {fontSize: FUENTE, color: COL.bolsa, align: "right"},
        axisLabel: {fontSize: FUENTE, color: COL.bolsa, formatter: v => nf(v, 0)}}));
      pers.forEach((q, i) => o.series.push({name: q.nombre.replace(/^Bolsa /, "Bolsa ").replace("últimos 12 meses", "12 meses"), type: "line", yAxisIndex: 1, showSymbol: false,
        data: (q.est.perfil[tipo] || q.est.perfil.ordinario).map(v => v == null ? null : +v.toFixed(2)),
        lineStyle: {width: 2, color: BOLSA_COL[i % BOLSA_COL.length], type: "dashed"}, itemStyle: {color: BOLSA_COL[i % BOLSA_COL.length]}}));
      o.grid.right = 8;
      o.legend.type = "scroll";
    }
    o.tooltip.axisPointer = {type: "line"};
    o.tooltip.formatter = ps => {
      const h = +ps[0].axisValue, hh = x => String(x).padStart(2, "0");
      return `<b>Hora ${h}</b> (${hh(h - 1)}:00–${hh(h - 1)}:59)<br>` + ps.map(p =>
        `${p.marker}${esc(p.seriesName.replace(/ \(.*/, ""))}: <b>${p.value == null ? "—" : nf(p.value, p.seriesIndex ? 1 : 2)}</b> ${p.seriesIndex ? "$/kWh" : "MWh/h"}`).join("<br>");
    };
    return {opt: o, sub: sub + (pers && pers.length ? ` · bolsa del mismo tipo de día` : "")};
  }

  function mesCercano(mensual, fecha) {
    const ks = Object.keys(mensual || {});
    if (!ks.length) return null;
    const ym = /^(\d{4})-(\d{2})/.exec(fecha || "");
    if (!ym) return ks.sort().pop();
    const idx = k => +k.slice(0, 4) * 12 + +k.slice(5, 7);
    const obj = +ym[1] * 12 + +ym[2];
    return ks.reduce((b, k) => Math.abs(idx(k) - obj) < Math.abs(idx(b) - obj) ? k : b);
  }

  function gPrecio(P, c, bolsa, pers) {
    const ps = P.filter(p => precioOk(p) != null);
    if (!ps.length) return P.some(p => num(p.energia_adjudicada_gwh) != null) ? {aviso: "Ningún producto seleccionado tiene precio adjudicado"} : null;
    const mk = bolsa && bolsa.mensual ? mesCercano(bolsa.mensual, c.fecha_cierre || c.fecha_limite_oferta) : null;
    const pb = mk ? bolsa.mensual[mk] : null;
    const o = baseOpt();
    o.xAxis = eje({type: "category", data: ps.map(p => pLabel(p.producto))});
    o.yAxis = valor("$/kWh", {axisLabel: {fontSize: FUENTE, color: COL.muted, formatter: v => nf(v, 0)}});
    o.tooltip.valueFormatter = v => v == null ? "—" : "$ " + nf(v, 2) + " /kWh";
    const serie = {name: "Precio adjudicado", type: "bar", barMaxWidth: 40, itemStyle: {color: COL.adj}, data: ps.map(precioOk)};
    o.series = [serie];
    if (pers && pers.length) {
      serie.markLine = {silent: true, symbol: "none", data: pers.filter(q => q.est.media != null).map((q, i) => ({yAxis: +q.est.media.toFixed(2),
        lineStyle: {color: BOLSA_COL[i % BOLSA_COL.length], type: "dashed", width: 2},
        label: {fontSize: FUENTE, color: BOLSA_COL[i % BOLSA_COL.length], position: "insideEndTop", formatter: `${q.nombre.replace(/^Bolsa /, "")}: $ ${nf(q.est.media, 0)}`}}))};
      pers.forEach((q, i) => o.series.push({name: q.nombre, type: "line", data: ps.map(() => q.est.media), showSymbol: false,
        lineStyle: {width: 0, opacity: 0}, itemStyle: {color: BOLSA_COL[i % BOLSA_COL.length]}}));
      o.legend.type = "scroll";
      o.tooltip.formatter = xs => {
        const pa = xs[0].data, h = [`<b>${esc(xs[0].axisValue)}</b>: precio adjudicado <b>$ ${nf(pa, 2)}</b> /kWh`];
        pers.forEach((q, i) => {
          if (q.est.media == null) return;
          const d = pa - q.est.media, pc = d / q.est.media * 100;
          h.push(`<span style="color:${BOLSA_COL[i % BOLSA_COL.length]}">●</span> ${esc(q.nombre)}: $ ${nf(q.est.media, 2)} · adjudicado ${d >= 0 ? "+" : "−"}$ ${nf(Math.abs(d), 2)} (${d >= 0 ? "+" : "−"}${nf(Math.abs(pc), 1)} %)`);
        });
        return h.join("<br>");
      };
      o.legend.data = [serie.name, ...pers.map(q => q.nombre)];
      return {opt: o, sub: `Solo productos con precio adjudicado (${ps.length} de ${P.length}) · líneas: promedio de bolsa de cada periodo elegido`};
    }
    if (pb != null) {
      const [y, m] = mk.split("-");
      const et = `Bolsa ${MESES[+m - 1]} ${y}: $ ${nf(pb, 0)}`;
      serie.markLine = {silent: true, symbol: "none", lineStyle: {color: COL.bolsa, type: "dashed", width: 2},
        label: {fontSize: FUENTE, color: COL.bolsa, formatter: et, position: "insideEndTop"},
        data: [{yAxis: pb}]};
      // serie vacía para que aparezca en la leyenda y el tooltip
      o.series.push({name: `Promedio bolsa ${MESES[+m - 1]} ${y}`, type: "line", data: ps.map(() => pb), showSymbol: false,
        lineStyle: {width: 0, opacity: 0}, itemStyle: {color: COL.bolsa}, tooltip: {valueFormatter: v => "$ " + nf(v, 2) + " /kWh"}});
    }
    o.legend.data = [serie.name];
    const usaCierre = !!c.fecha_cierre, fref = c.fecha_cierre || c.fecha_limite_oferta;
    const base = `Solo productos con precio adjudicado (${ps.length} de ${P.length})`;
    const linea = pb == null ? "sin datos de bolsa para comparar"
      : `la línea es el promedio de bolsa del ${usaCierre ? "mes de cierre" : fref ? "mes límite de oferta" : "último mes con dato"}` + (fref && mk !== String(fref).slice(0, 7) ? " (mes con dato más cercano)" : "");
    return {opt: o, sub: base + " · " + linea};
  }

  // ---- Sensibilidad con el precio de bolsa: periodos elegidos por el usuario ----
  // Fichas: "cierre" (mes de cierre), "12m" (últimos 12 meses), "AAAA" (año), "AAAA-MM:AAAA-MM" (rango de meses).
  const BOLSA_COL = ["#C2410C", "#7C3AED", "#0E7490", "#BE185D", "#B45309", "#15803D", "#64748B", "#1D4ED8"];
  const TIPO_BOLSA = {laborable: "ordinario", sabado: "sabado", domingo_festivo: "festivo"};
  const finMes = ym => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
  const mesTxt = ym => { const [y, m] = ym.split("-"); return `${MESES[+m - 1]} ${y}`; };

  function periodo(tok, c, res) {
    const hasta = res.hasta || "";
    if (tok === "cierre") {
      const mk = res.mensual ? mesCercano(res.mensual, c.fecha_cierre || c.fecha_limite_oferta) : null;
      return mk ? {tok, nombre: `Bolsa ${mesTxt(mk)}`, desde: mk + "-01", hasta: finMes(mk)} : null;
    }
    if (tok === "12m") {
      if (!hasta) return null;
      const d = new Date(hasta + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 364);
      return {tok, nombre: "Bolsa últimos 12 meses", desde: d.toISOString().slice(0, 10), hasta};
    }
    if (/^\d{4}$/.test(tok)) return {tok, nombre: `Bolsa ${tok}` + (hasta.slice(0, 4) === tok ? ` (a ${mesTxt(hasta.slice(0, 7))})` : ""), desde: tok + "-01-01", hasta: tok + "-12-31"};
    const m = /^(\d{4}-\d{2}):(\d{4}-\d{2})$/.exec(tok);
    if (m && m[1] <= m[2]) return {tok, nombre: `Bolsa ${mesTxt(m[1])} – ${mesTxt(m[2])}`, desde: m[1] + "-01", hasta: finMes(m[2])};
    return null;
  }

  // Promedio de todas las horas y perfil horario por tipo de día ($/kWh) de un periodo, desde bolsa.json.
  function estadistica(B, desde, hasta) {
    const acc = {ordinario: [], sabado: [], festivo: []};
    for (const t in acc) for (let h = 0; h < 24; h++) acc[t].push([0, 0]);
    let s = 0, n = 0, dias = 0;
    for (let i = 0; i < B.fechas.length; i++) {
      const f = B.fechas[i];
      if (f < desde || f > hasta) continue;
      dias++;
      const t = TIPO_BOLSA[B.tipo[i]] || "ordinario", fila = B.p[i] || [];
      for (let h = 0; h < 24; h++) { const v = fila[h]; if (v != null && isFinite(v)) { s += +v; n++; acc[t][h][0] += +v; acc[t][h][1]++; } }
    }
    const perfil = {};
    for (const t in acc) perfil[t] = acc[t].map(([x, k]) => (k ? x / k : null));
    perfil.festivo_lunes = perfil.festivo;
    return {media: n ? s / n : null, perfil, dias};
  }

  const cacheBolsa = {};
  function cargarBolsa(base) {
    if (!cacheBolsa[base]) cacheBolsa[base] = fetch(base + "bolsa.json").then(r => { if (!r.ok) throw new Error("bolsa.json " + r.status); return r.json(); })
      .catch(e => { delete cacheBolsa[base]; throw e; });
    return cacheBolsa[base];
  }

  function bolsaDeUrl() {
    try { const v = new URLSearchParams(location.search).get("b"); return v ? v.split(",").filter(Boolean) : []; } catch (e) { return []; }
  }

  // Selección de productos en el enlace (?p=1,3) para compartir la vista filtrada.
  function selDeUrl() {
    try { const v = new URLSearchParams(location.search).get("p"); return new Set(v ? v.split(",").map(x => String(Number(x))).filter(x => x !== "NaN") : []); }
    catch (e) { return new Set(); }
  }
  function selAUrl(s, clave = "p", valores) {
    try {
      const u = new URL(location.href);
      const v = valores || [...s].sort((a, b) => a - b);
      if (v.length) u.searchParams.set(clave, v.join(",")); else u.searchParams.delete(clave);
      history.replaceState(history.state, "", u.toString().replace(/%2C/g, ",").replace(/%3A/g, ":"));
    } catch (e) { /* sin historial: el filtro sigue funcionando en la página */ }
  }

  function renderTablero(el, d) {
    estilo();
    if (typeof window.echarts === "undefined" && document.readyState !== "complete" && !el._tbEsperando) {
      el._tbEsperando = true;  // ECharts se carga con defer: esperar a que termine la carga de la página
      window.addEventListener("load", () => renderTablero(el, d), {once: true});
    }
    const {conv: c, productos: P0, paquete: paq0, bolsa} = d || {};
    if (!c || !el) return;
    el._tbDatos = d;
    const Ptodos = (P0 || []).filter(p => p && p.producto);
    const prods0 = (paq0 && paq0.cantidades && paq0.cantidades.productos) || {};
    const nums = [...new Set(Ptodos.length ? Ptodos.map(p => pNum(p.producto)).filter(Boolean) : Object.keys(prods0).map(k => String(Number(k))))]
      .sort((a, b) => a - b);
    if (!el._tbSel) el._tbSel = selDeUrl();
    const sel = new Set([...el._tbSel].filter(n => nums.includes(n)));
    const filtrando = sel.size > 0 && sel.size < nums.length;
    const P = filtrando ? Ptodos.filter(p => sel.has(pNum(p.producto))) : Ptodos;
    const paquete = filtrando && paq0 && paq0.cantidades ? Object.assign({}, paq0, {cantidades: Object.assign({}, paq0.cantidades,
      {productos: Object.fromEntries(Object.entries(prods0).filter(([k]) => sel.has(String(Number(k)))))})}) : paq0;
    const base = d.base || "data/";
    if (!el._tbBolsa) el._tbBolsa = bolsaDeUrl();
    const toks = el._tbBolsa;
    let pers = null, estadoB = "";
    if (toks.length && bolsa) {
      if (el._tbB && el._tbB.base === base) {
        pers = toks.map(t => periodo(t, c, bolsa)).filter(Boolean).map(q => Object.assign(q, {est: estadistica(el._tbB.datos, q.desde, q.hasta)}))
          .filter(q => q.est.dias);
        if (!pers.length) { pers = null; estadoB = `<span class="err">Sin datos de bolsa para el periodo elegido.</span>`; }
      } else if (el._tbBErr) {
        estadoB = `<span class="err">No se pudo cargar el histórico de bolsa. Intente de nuevo.</span>`;
      } else {
        estadoB = `<span class="cargando">Cargando histórico de bolsa…</span>`;
        if (!el._tbBCargando) {
          el._tbBCargando = true;
          cargarBolsa(base).then(B => { el._tbB = {base, datos: B}; }).catch(() => { el._tbBErr = true; })
            .finally(() => { el._tbBCargando = false; renderTablero(el, el._tbDatos); });
        }
      }
    }
    const anios = bolsa && bolsa.desde && bolsa.hasta ? Array.from({length: +bolsa.hasta.slice(0, 4) - +bolsa.desde.slice(0, 4) + 1}, (_, i) => String(+bolsa.desde.slice(0, 4) + i)) : [];
    const mesesB = bolsa && bolsa.mensual ? Object.keys(bolsa.mensual).sort() : [];
    const rango = toks.find(t => t.includes(":")) || "";
    const [rd, rh] = rango ? rango.split(":") : [mesesB[Math.max(0, mesesB.length - 12)] || "", mesesB[mesesB.length - 1] || ""];
    const op = (v, sel) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(mesTxt(v))}</option>`;
    const bt = (v, txt) => `<button type="button" data-b="${esc(v)}" aria-pressed="${toks.includes(v)}">${esc(txt)}</button>`;
    const filtroB = bolsa && mesesB.length ? `<div class="filtro bolsa" role="group" aria-label="Periodo del precio de bolsa"><span class="fl">Bolsa para comparar:</span>
      <button type="button" data-b="" aria-pressed="${!toks.length}">Predeterminado</button>
      ${bt("cierre", "Mes de cierre")}${bt("12m", "Últimos 12 meses")}<span class="sep"></span>
      ${anios.map(a => bt(a, a)).join("")}<span class="sep"></span>
      <span class="fl">Rango:</span><select data-r="d" aria-label="Desde">${mesesB.map(m => op(m, rd)).join("")}</select>
      <select data-r="h" aria-label="Hasta">${mesesB.map(m => op(m, rh)).join("")}</select>
      <button type="button" data-b="rango" aria-pressed="${!!rango}">${rango ? "Quitar rango" : "Aplicar rango"}</button>
      ${estadoB}</div>` : "";
    const filtro = nums.length > 1 ? `<div class="filtro prods" role="group" aria-label="Filtrar por producto"><span class="fl">Productos:</span>
      <button type="button" data-p="" aria-pressed="${!filtrando}">Todos</button>
      ${nums.map(n => `<button type="button" data-p="${esc(n)}" aria-pressed="${filtrando && sel.has(n)}">P${esc(n)}</button>`).join("")}</div>` : "";
    const alertas = ((paquete && paquete.alertas) || []).filter(a => /SICEP|diferencia/i.test(String(a)));
    const hayEcharts = typeof window.echarts !== "undefined";
    const defs = [
      ["Demanda por producto", "GWh demandados vs adjudicados (datos SICEP)", gDemanda(P)],
      ["MWh por año", "Energía por producto según el anexo de cantidades", gAnual(paquete)],
      ["Curva horaria vs precio de bolsa", "Demanda promedio por hora y precio de bolsa de los últimos 12 meses", gCurva(paquete, bolsa, P, pers)],
      ["Precio adjudicado vs bolsa", "", gPrecio(P, c, bolsa, pers)]].filter(x => x[2]);
    const gr = defs.map(([t, s, r], i) => `<div class="gc"><h4>${esc(t)}</h4>${(r.sub || s) ? `<div class="sub">${esc(r.sub || s)}</div>` : ""}
      ${r.aviso ? `<div class="aviso">${esc(r.aviso)}</div>` : `<div class="plot" id="tb-g${i}" role="img" aria-label="${esc(t)}"></div>`}</div>`).join("");
    el.innerHTML = `<section class="tb" aria-label="Tablero de la convocatoria">
      ${kpis(c, P, filtrando ? {total: nums.length} : null)}
      ${filtro}
      ${filtroB}
      ${alertas.length ? `<div class="roja"><b>Revisar:</b><ul>${alertas.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
      ${!hayEcharts ? `<div class="aviso gen">No se pudo cargar la librería de gráficos. Los indicadores de arriba siguen disponibles.</div>` : ""}
      ${hayEcharts ? `<div class="graficos">${gr}</div>` : ""}</section>`;
    if (!el._tbFiltro) {
      el._tbFiltro = true;
      el.addEventListener("click", ev => {
        const b = ev.target.closest(".tb .filtro button");
        if (!b || !el.contains(b)) return;
        if (b.dataset.b !== undefined) {
          let t = el._tbBolsa.slice();
          const v = b.dataset.b;
          if (!v) t = [];
          else if (v === "rango") {
            const r = t.find(x => x.includes(":"));
            t = t.filter(x => !x.includes(":"));
            if (!r) {
              const dd = el.querySelector('.tb select[data-r="d"]').value, hh = el.querySelector('.tb select[data-r="h"]').value;
              t.push(dd <= hh ? `${dd}:${hh}` : `${hh}:${dd}`);
            }
          } else t = t.includes(v) ? t.filter(x => x !== v) : t.concat(v);
          el._tbBolsa = t; el._tbBErr = false;
          selAUrl(null, "b", t);
          renderTablero(el, el._tbDatos);
          return;
        }
        const n = b.dataset.p, s = new Set(el._tbSel);
        if (!n) s.clear(); else if (s.has(n)) s.delete(n); else s.add(n);
        el._tbSel = s;
        selAUrl(s);
        renderTablero(el, el._tbDatos);
      });
    }
    if (!hayEcharts) return;
    (el._tbCharts || []).forEach(ch => ch.dispose());
    el._tbCharts = [];
    defs.forEach(([, , r], i) => {
      if (!r.opt) return;
      const ch = echarts.init(el.querySelector("#tb-g" + i));
      ch.setOption(r.opt);
      el._tbCharts.push(ch);
    });
    if (!el._tbRO && window.ResizeObserver) {
      el._tbRO = new ResizeObserver(() => (el._tbCharts || []).forEach(ch => ch.resize()));
      el._tbRO.observe(el);
    }
  }
  window.renderTablero = renderTablero;
})();
