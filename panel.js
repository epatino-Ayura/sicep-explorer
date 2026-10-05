// panel.js — Panel agregado de la página principal: KPIs y gráficos de los productos filtrados.
// renderPanel(el, {productos, curvas, bolsaResumen, base}); reutiliza las piezas de tablero.js (window.TableroUtil).
(function () {
  "use strict";
  const U = window.TableroUtil;
  const {esc, nf, num, precioOk, COL, baseOpt, eje, valor} = U;
  const SIN_ADJ = "Sin productos adjudicados en la selección";

  // Precio ponderado por energía adjudicada; solo productos con precio > 0 (SICEP publica 0 en los no adjudicados).
  function ponderado(P) {
    let w = 0, sw = 0;
    P.forEach(p => { const v = precioOk(p), e = num(p.energia_adjudicada_gwh); if (v != null && e > 0) { w += e; sw += v * e; } });
    return w ? sw / w : null;
  }
  const suma = (P, k) => P.reduce((s, p) => num(p[k]) == null ? s : (s ?? 0) + num(p[k]), null);
  const agrupar = (P, f) => { const g = new Map(); P.forEach(p => { const k = f(p); if (k == null || k === "") return; if (!g.has(k)) g.set(k, []); g.get(k).push(p); }); return g; };
  const r2 = v => v == null ? null : Math.round(v * 100) / 100;

  function kpis(P) {
    const dem = suma(P, "energia_demandada_gwh"), adj = suma(P, "energia_adjudicada_gwh");
    const pct = dem && adj != null ? adj / dem * 100 : null, precio = ponderado(P);
    const distintos = k => new Set(P.map(p => p[k]).filter(v => v != null && v !== "")).size;
    return `<div class="kpis">
      ${U.kpi("Convocatorias", nf(distintos("convocatoria"), 0), "", "k-conv")}
      ${U.kpi("Productos", nf(P.length, 0), "", "k-prod")}
      ${U.kpi("GWh demandados", nf(dem, 0), "", "k-dem")}
      ${U.kpi("GWh adjudicados", nf(adj, 0), pct == null ? "" : nf(pct, 0) + " % de lo demandado", "k-adj")}
      ${U.kpi("Precio adjudicado", precio == null ? "—" : "$ " + nf(precio, 2), "$/kWh, promedio ponderado", "k-precio")}
      ${U.kpi("Compradores", nf(distintos("agente_comprador"), 0), "", "k-comp")}</div>`;
  }

  // 1. Precio ponderado por año (barras) vs promedio de bolsa del año (línea: media de los meses de bolsa_resumen).
  function gPrecioAnio(P, res) {
    const g = agrupar(P.filter(p => precioOk(p) != null && num(p.energia_adjudicada_gwh) > 0), p => p.anio == null ? null : String(p.anio));
    if (!g.size) return {aviso: SIN_ADJ};
    const anios = [...g.keys()].sort();
    const precio = anios.map(a => r2(ponderado(g.get(a))));
    const mensual = (res && res.mensual) || {};
    const bolsa = anios.map(a => { const v = Object.keys(mensual).filter(m => m.startsWith(a + "-")).map(m => num(mensual[m])).filter(v => v != null);
      return v.length ? r2(v.reduce((s, x) => s + x, 0) / v.length) : null; });
    const o = baseOpt();
    o.xAxis = eje({type: "category", data: anios});
    o.yAxis = valor("$/kWh", {axisLabel: {fontSize: U.FUENTE, color: COL.muted, formatter: v => nf(v, 0)}});
    o.series = [{name: "Precio adjudicado", type: "bar", barMaxWidth: 40, itemStyle: {color: COL.adj}, data: precio}];
    if (bolsa.some(v => v != null)) o.series.push({name: "Bolsa promedio del año", type: "line", data: bolsa, connectNulls: true,
      symbolSize: 7, lineStyle: {width: 2, color: COL.bolsa, type: "dashed"}, itemStyle: {color: COL.bolsa}});
    o.tooltip.formatter = xs => {
      const i = xs[0].dataIndex, pa = precio[i], pb = bolsa[i];
      const h = [`<b>${esc(xs[0].axisValue)}</b>`, `Precio adjudicado: <b>$ ${nf(pa, 2)}</b> /kWh`];
      if (pb != null) {
        const d = pa - pb, pc = d / pb * 100, sg = d >= 0 ? "+" : "−";
        h.push(`Bolsa promedio: $ ${nf(pb, 2)} /kWh`, `Diferencia: ${sg}$ ${nf(Math.abs(d), 2)} (${sg}${nf(Math.abs(pc), 1)} %)`);
      } else h.push("Sin dato de bolsa para el año");
      return h.join("<br>");
    };
    return {opt: o};
  }

  // 2. Curva horaria agregada: suma de la curva de día ordinario de los productos con curva (curvas.json) vs bolsa.
  function gCurva(P, curvas, res, pers) {
    const con = P.map(p => curvas && p.producto ? curvas[p.producto] : null).filter(c => Array.isArray(c) && c.length === 24);
    const sub = `Suma de ${con.length} de ${P.length} productos con curva · día ordinario`;
    if (!con.length) return {aviso: curvas ? "Ningún producto de la selección tiene curva horaria" : "Curvas horarias no disponibles", sub};
    const dem = new Array(24).fill(0);
    con.forEach(c => c.forEach((v, h) => { dem[h] += num(v) || 0; }));
    return {opt: U.optCurva(dem, "ordinario", res, pers), sub: sub + (pers && pers.length ? " · bolsa de días laborables" : "")};
  }

  // 3. GWh demandados vs adjudicados por año.
  function gEnergia(P) {
    const g = agrupar(P.filter(p => num(p.energia_demandada_gwh) != null || num(p.energia_adjudicada_gwh) != null), p => p.anio == null ? null : String(p.anio));
    if (!g.size) return {aviso: "Sin energía publicada en la selección"};
    const anios = [...g.keys()].sort();
    const o = baseOpt();
    o.xAxis = eje({type: "category", data: anios});
    o.yAxis = valor("GWh", {axisLabel: {fontSize: U.FUENTE, color: COL.muted, formatter: U.compacto}});
    o.tooltip.valueFormatter = v => v == null ? "—" : nf(v, 0) + " GWh";
    o.series = [
      {name: "Demandado", type: "bar", barMaxWidth: 34, itemStyle: {color: COL.dem}, data: anios.map(a => r2(suma(g.get(a), "energia_demandada_gwh")))},
      {name: "Adjudicado", type: "bar", barMaxWidth: 34, itemStyle: {color: COL.adj}, data: anios.map(a => r2(suma(g.get(a), "energia_adjudicada_gwh")))}];
    return {opt: o};
  }

  // 4. Precio ponderado de los 10 compradores con más GWh adjudicados.
  function gCompradores(P) {
    const g = agrupar(P.filter(p => num(p.energia_adjudicada_gwh) > 0), p => p.agente_comprador);
    const top = [...g.entries()].map(([k, ps]) => ({k, gwh: suma(ps, "energia_adjudicada_gwh"), precio: ponderado(ps)}))
      .filter(x => x.precio != null).sort((a, b) => b.gwh - a.gwh).slice(0, 10);
    if (!top.length) return {aviso: SIN_ADJ};
    const o = baseOpt();
    o.legend.show = false;
    o.grid.top = 22;
    o.yAxis = eje({type: "category", data: top.map(x => x.k), inverse: true});
    o.xAxis = valor("$/kWh", {axisLabel: {fontSize: U.FUENTE, color: COL.muted, formatter: v => nf(v, 0)},
      nameTextStyle: {fontSize: U.FUENTE, color: COL.muted}});
    o.series = [{name: "Precio adjudicado", type: "bar", barMaxWidth: 18, itemStyle: {color: COL.adj}, data: top.map(x => r2(x.precio))}];
    o.tooltip.formatter = xs => { const x = top[xs[0].dataIndex];
      return `<b>${esc(x.k)}</b><br>Precio adjudicado: <b>$ ${nf(x.precio, 2)}</b> /kWh<br>${nf(x.gwh, 0)} GWh adjudicados`; };
    return {opt: o, sub: `Los ${top.length === 10 ? "10" : top.length} con más GWh adjudicados · precio promedio ponderado`};
  }

  function renderPanel(el, d) {
    if (!el || !U) return;
    U.estilo();
    U.esperarEcharts(el, () => renderPanel(el, el._tbDatos));
    el._tbDatos = d;
    const P = ((d && d.productos) || []).filter(Boolean);
    const res = d.bolsaResumen || null, base = d.base || "data/";
    if (!el._tbBolsa) el._tbBolsa = U.bolsaDeUrl().filter(t => t !== "cierre");   // sin "mes de cierre": varias convocatorias
    const toks = el._tbBolsa;
    const {pers, estadoB} = U.periodosBolsa(el, toks, null, res, base, () => renderPanel(el, el._tbDatos));
    const hayEcharts = typeof window.echarts !== "undefined";
    const defs = [
      ["Precio adjudicado por año vs bolsa", "Promedio ponderado por GWh adjudicados · línea: promedio de bolsa del año", gPrecioAnio(P, res)],
      ["Curva horaria agregada vs bolsa", "", gCurva(P, d.curvas, res, pers)],
      ["Energía por año", "GWh demandados vs adjudicados", gEnergia(P)],
      ["Precio adjudicado por comprador", "", gCompradores(P)]];
    el.innerHTML = `<section class="tb pn" aria-label="Panel de la selección">
      ${kpis(P)}
      ${U.htmlFiltroBolsa(res, toks, estadoB, false)}
      ${!hayEcharts ? `<div class="aviso gen">No se pudo cargar la librería de gráficos. Los indicadores de arriba siguen disponibles.</div>`
        : `<div class="graficos">${U.htmlGraficos(defs, "pn-g")}</div>`}</section>`;
    if (!el._pnClic) {
      el._pnClic = true;
      el.addEventListener("click", ev => {
        const b = ev.target.closest(".filtro.bolsa button");
        if (!b || !el.contains(b)) return;
        el._tbBolsa = U.clicBolsa(el, el._tbBolsa, b.dataset.b);
        renderPanel(el, el._tbDatos);
      });
    }
    if (hayEcharts) U.pintarGraficos(el, defs, "pn-g");
  }
  window.renderPanel = renderPanel;
})();
