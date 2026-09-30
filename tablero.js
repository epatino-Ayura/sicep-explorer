// tablero.js — Tablero visual por convocatoria (sitio público y app local).
// renderTablero(el, {conv, productos, paquete, bolsa}); usa ECharts 5 si está cargado (window.echarts).
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const nf = (v, d) => v == null || isNaN(v) ? "—" : Number(v).toLocaleString("es", {minimumFractionDigits: d, maximumFractionDigits: d});
  const COL = {dem: "#B8C7D9", adj: "#2E6FB0", bolsa: "#C2410C", ink: "#1a1d21", muted: "#6b7280", line: "#e6e6e3"};
  const PALETA = ["#2E6FB0", "#1E8E5A", "#C2410C", "#7C3AED", "#B45309", "#0E7490", "#BE185D", "#64748B"];
  const FUENTE = 12;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const num = v => v == null || v === "" || isNaN(v) ? null : Number(v);
  const anio = s => s ? String(s).slice(0, 4) : "";
  const pLabel = p => { const m = /(\d+)\s*$/.exec(p || ""); return m ? "P" + Number(m[1]) : String((p || "").split("-").pop()); };
  const pNum = p => { const m = /(\d+)\s*$/.exec(p || ""); return m ? String(Number(m[1])) : null; };
  const compacto = v => Math.abs(v) >= 1e6 ? nf(v / 1e6, 1) + " M" : Math.abs(v) >= 1e3 ? nf(v / 1e3, 0) + " mil" : nf(v, 0);

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

  function kpis(c, P) {
    const dem = num(c.energia_demandada_gwh), adj = num(c.energia_adjudicada_gwh);
    const pct = dem && adj != null ? adj / dem * 100 : null;
    const k = (l, n, s, cls) => `<div class="kpi ${cls || ""}"><div class="l">${esc(l)}</div><div class="n ${/^t/.test(cls || "") ? "t" : ""}">${n}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
    const t = (l, v) => `<div class="kpi"><div class="l">${esc(l)}</div><div class="n t">${esc(v || "—")}</div></div>`;
    const ini = anio(c.inicio_suministro), fin = anio(c.fin_suministro);
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
      ${k("Precio adjudicado", num(c.precio_prom_ponderado) == null ? "—" : "$ " + nf(c.precio_prom_ponderado, 2), "$/kWh, promedio ponderado")}
      ${k("Productos", c.n_productos ?? P.length ?? "—")}
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
  const valor = (name, extra) => eje(Object.assign({type: "value", name, nameTextStyle: {fontSize: FUENTE, color: COL.muted, align: "left"},
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
    o.series = claves.map((k, i) => ({name: "P" + Number(k), type: "bar", stack: "mwh", barMaxWidth: 38,
      itemStyle: {color: PALETA[i % PALETA.length]}, data: anios.map(a => num(prods[k].mwh_anual[a]))}));
    return {opt: o};
  }

  function gCurva(paquete, bolsa) {
    const prods = paquete && paquete.cantidades && paquete.cantidades.productos;
    const con = prods ? Object.values(prods).filter(p => p && p.perfil && Object.values(p.perfil).some(a => Array.isArray(a) && a.length === 24)) : [];
    if (!con.length) return {aviso: "Sin perfil horario de demanda (anexo no reconocido)"};
    const dem = new Array(24).fill(0);
    con.forEach(p => {
      const a = (Array.isArray(p.perfil.ordinario) && p.perfil.ordinario.length === 24) ? p.perfil.ordinario
        : Object.values(p.perfil).find(x => Array.isArray(x) && x.length === 24);
      a.forEach((v, h) => { dem[h] += num(v) || 0; });
    });
    const bp = bolsa && Array.isArray(bolsa.perfil_12m) && bolsa.perfil_12m.length === 24 ? bolsa.perfil_12m : null;
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
    o.tooltip.axisPointer = {type: "line"};
    o.tooltip.formatter = ps => {
      const h = +ps[0].axisValue, hh = x => String(x).padStart(2, "0");
      return `<b>Hora ${h}</b> (${hh(h - 1)}:00–${hh(h - 1)}:59)<br>` + ps.map(p =>
        `${p.marker}${esc(p.seriesName.replace(/ \(.*/, ""))}: <b>${p.value == null ? "—" : nf(p.value, p.seriesIndex ? 1 : 2)}</b> ${p.seriesIndex ? "$/kWh" : "MWh/h"}`).join("<br>");
    };
    return {opt: o};
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

  function gPrecio(P, c, bolsa) {
    const ps = P.filter(p => num(p.precio_prom_adjudicado) != null);
    if (!ps.length) return null;
    const mk = bolsa && bolsa.mensual ? mesCercano(bolsa.mensual, c.fecha_cierre || c.fecha_limite_oferta) : null;
    const pb = mk ? bolsa.mensual[mk] : null;
    const o = baseOpt();
    o.xAxis = eje({type: "category", data: ps.map(p => pLabel(p.producto))});
    o.yAxis = valor("$/kWh", {axisLabel: {fontSize: FUENTE, color: COL.muted, formatter: v => nf(v, 0)}});
    o.tooltip.valueFormatter = v => v == null ? "—" : "$ " + nf(v, 2) + " /kWh";
    const serie = {name: "Precio adjudicado", type: "bar", barMaxWidth: 40, itemStyle: {color: COL.adj}, data: ps.map(p => num(p.precio_prom_adjudicado))};
    o.series = [serie];
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
    return {opt: o, sub: pb != null ? "La línea es el promedio de bolsa del mes de cierre" + (mk !== String(c.fecha_cierre || "").slice(0, 7) ? " (mes con dato más cercano)" : "") : "Sin datos de bolsa para comparar"};
  }

  function renderTablero(el, d) {
    estilo();
    const {conv: c, productos: P0, paquete, bolsa} = d || {};
    if (!c || !el) return;
    const P = (P0 || []).filter(p => p && p.producto);
    const alertas = ((paquete && paquete.alertas) || []).filter(a => /SICEP|diferencia/i.test(String(a)));
    const hayEcharts = typeof window.echarts !== "undefined";
    const defs = [
      ["Demanda por producto", "GWh demandados vs adjudicados (datos SICEP)", gDemanda(P)],
      ["MWh por año", "Energía por producto según el anexo de cantidades", gAnual(paquete)],
      ["Curva horaria vs precio de bolsa", "Demanda promedio por hora y precio de bolsa de los últimos 12 meses", gCurva(paquete, bolsa)],
      ["Precio adjudicado vs bolsa", "", gPrecio(P, c, bolsa)]].filter(x => x[2]);
    const gr = defs.map(([t, s, r], i) => `<div class="gc"><h4>${esc(t)}</h4>${(r.sub || s) ? `<div class="sub">${esc(r.sub || s)}</div>` : ""}
      ${r.aviso ? `<div class="aviso">${esc(r.aviso)}</div>` : `<div class="plot" id="tb-g${i}" role="img" aria-label="${esc(t)}"></div>`}</div>`).join("");
    el.innerHTML = `<section class="tb" aria-label="Tablero de la convocatoria">
      ${kpis(c, P)}
      ${alertas.length ? `<div class="roja"><b>Revisar:</b><ul>${alertas.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
      ${!hayEcharts ? `<div class="aviso gen">No se pudo cargar la librería de gráficos. Los indicadores de arriba siguen disponibles.</div>` : ""}
      ${hayEcharts ? `<div class="graficos">${gr}</div>` : ""}</section>`;
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
