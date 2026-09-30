// bolsa.js — Página "Precio de bolsa": filtros, indicadores, gráficos ECharts y CSV (todo en el navegador).
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const $ = id => document.getElementById(id);
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const TIPO = {laborable: "laborable", sabado: "sábado", domingo_festivo: "domingo/festivo"};
  const PALETA = ["#2E6FB0", "#1E8E5A", "#C2410C", "#7C3AED", "#B45309", "#0E7490", "#BE185D"];
  const FUENTE = 12;
  const f1 = v => v == null ? "—" : "$ " + Number(v).toLocaleString("es", {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const hh = h => String(h).padStart(2, "0") + ":00";
  const fechaLarga = iso => { const [y, m, d] = iso.split("-"); return `${+d} ${MESES[+m - 1].toLowerCase()} ${y}`; };

  let D = null, dias = [], charts = {}, timer = null;
  const est = {anios: new Set(), meses: new Set()};

  // --- indexado único: una estructura por día ---
  function indexar(d) {
    return d.fechas.map((f, i) => ({f, y: +f.slice(0, 4), m: +f.slice(5, 7), ym: f.slice(0, 7), t: d.tipo[i], p: d.p[i]}));
  }

  function mascara() {
    const m = new Array(24).fill(false), fr = $("franja").value;
    if (fr === "pico") for (let h = 17; h <= 21; h++) m[h] = true;
    else if (fr === "valle") for (let h = 0; h <= 7; h++) m[h] = true;
    else if (fr === "pers") {
      const a = +$("h1").value - 1, b = +$("h2").value - 1;
      for (let h = a; ; h = (h + 1) % 24) { m[h] = true; if (h === b) break; }
    } else m.fill(true);
    return m;
  }

  function filtrar() {
    const d0 = $("desde").value, d1 = $("hasta").value, tp = $("tipo").value;
    return dias.filter(x => x.p && (!d0 || x.f >= d0) && (!d1 || x.f <= d1) &&
      (!est.anios.size || est.anios.has(x.y)) && (!est.meses.size || est.meses.has(x.m)) &&
      (tp === "todos" || x.t === tp));
  }

  const acc = () => ({s: 0, n: 0, mn: Infinity, mx: -Infinity});
  function suma(a, v) { a.s += v; a.n++; if (v < a.mn) a.mn = v; if (v > a.mx) a.mx = v; }
  const prom = a => a.n ? a.s / a.n : null;

  // --- agregados ---
  function calcular() {
    const dl = filtrar(), mk = mascara();
    const r = {total: acc(), dia: [], mes: new Map(), calor: new Map(), anio: new Map(), pico: acc(), valle: acc(),
               max: null, min: null, filas: dl, mk};
    for (const x of dl) {
      const ad = acc(); let mesA = r.mes.get(x.ym);
      if (!mesA) r.mes.set(x.ym, mesA = acc());
      let cal = r.calor.get(x.ym); if (!cal) r.calor.set(x.ym, cal = Array.from({length: 24}, acc));
      let an = r.anio.get(x.y); if (!an) r.anio.set(x.y, an = Array.from({length: 24}, acc));
      for (let h = 0; h < 24; h++) {
        const v = x.p[h]; if (v == null) continue;
        if (h >= 17 && h <= 21) suma(r.pico, v);
        if (h <= 7) suma(r.valle, v);
        if (!mk[h]) continue;
        suma(ad, v); suma(r.total, v); suma(mesA, v); suma(cal[h], v); suma(an[h], v);
        if (!r.max || v > r.max.v) r.max = {v, f: x.f, h};
        if (!r.min || v < r.min.v) r.min = {v, f: x.f, h};
      }
      if (ad.n) r.dia.push([x.f, +prom(ad).toFixed(2), ad.mn, ad.mx]);
    }
    return r;
  }

  // --- indicadores ---
  function kpis(r) {
    const u = dias[dias.length - 1], au = acc();
    (u.p || []).forEach(v => v != null && suma(au, v));
    $("kpi-ultimo").textContent = f1(prom(au));
    $("kpi-ultimo-s").textContent = `${fechaLarga(u.f)} · ${TIPO[u.t] || u.t} · $/kWh promedio`;
    const sin = !r.total.n;
    $("vacio").style.display = sin ? "block" : "none";
    $("vacio").textContent = "Sin datos para el filtro";
    $("kpi-prom").textContent = sin ? "—" : f1(prom(r.total));
    $("kpi-prom-s").textContent = sin ? "" : `${r.filas.length.toLocaleString("es")} días · ${r.total.n.toLocaleString("es")} valores`;
    const mm = (id, o) => { $("kpi-" + id).textContent = o ? f1(o.v) : "—"; $("kpi-" + id + "-s").textContent = o ? `${fechaLarga(o.f)} · ${hh(o.h)} (Hora ${o.h + 1})` : ""; };
    mm("max", r.max); mm("min", r.min);
    const p = prom(r.pico), v = prom(r.valle);
    $("kpi-pv").textContent = p == null || v == null ? "—" : `${f1(p)} / ${f1(v)}`;
    $("kpi-pv-s").textContent = p == null || v == null ? "" : `Pico H18–H22 vs valle H1–H8 · ${p > v ? "+" : ""}${((p / v - 1) * 100).toFixed(0)}%`;
  }

  // --- gráficos ---
  const tx = {color: "#41474e", fontSize: FUENTE};
  const ejeY = {type: "value", scale: true, axisLabel: {...tx, formatter: v => Math.round(v)}, splitLine: {lineStyle: {color: "#eee"}}};
  function graficoDiario(r) {
    const cat = r.dia.map(x => x[0]);
    charts.diario.setOption({
      animation: false, color: [PALETA[0]],
      grid: {left: 8, right: 14, top: 16, bottom: 84, containLabel: true},
      tooltip: {trigger: "axis", textStyle: {fontSize: FUENTE}, formatter: ps => {
        const i = ps[0].dataIndex, x = r.dia[i]; if (!x) return "";
        return `${esc(fechaLarga(x[0]))}<br>Promedio: <b>${f1(x[1])}</b><br>Mín: ${f1(x[2])}<br>Máx: ${f1(x[3])}`; }},
      xAxis: {type: "category", data: cat, axisLabel: tx, boundaryGap: false},
      yAxis: ejeY,
      dataZoom: [{type: "inside"}, {type: "slider", height: 26, bottom: 8, textStyle: {fontSize: FUENTE}}],
      series: [
        {name: "Mín", type: "line", data: r.dia.map(x => x[2]), stack: "b", symbol: "none", lineStyle: {opacity: 0}, silent: true},
        {name: "Rango", type: "line", data: r.dia.map(x => +(x[3] - x[2]).toFixed(2)), stack: "b", symbol: "none", lineStyle: {opacity: 0}, areaStyle: {color: "#2E6FB0", opacity: .15}, silent: true},
        {name: "Promedio", type: "line", data: r.dia.map(x => x[1]), symbol: "none", lineStyle: {width: 1.6}},
      ]}, true);
  }

  function graficoCalor(r) {
    const meses = [...r.calor.keys()].sort(), datos = [];
    const horas = []; r.mk.forEach((on, h) => on && horas.push(h));
    const parcial = horas.length < 24;
    $("calor-sub").textContent = parcial ? "Solo horas de la franja seleccionada." : "";
    let mx = 0;
    meses.forEach((m, i) => r.calor.get(m).forEach((a, h) => { if (a.n) { const v = +prom(a).toFixed(1); datos.push([i, horas.indexOf(h), v]); if (v > mx) mx = v; } }));
    charts.calor.setOption({
      animation: false,
      grid: {left: 8, right: 14, top: 10, bottom: 80, containLabel: true},
      tooltip: {textStyle: {fontSize: FUENTE}, formatter: p => `${esc(meses[p.value[0]])} · ${hh(horas[p.value[1]])} (Hora ${horas[p.value[1]] + 1})<br><b>${f1(p.value[2])}</b>`},
      xAxis: {type: "category", data: meses, axisLabel: tx, splitArea: {show: false}},
      yAxis: {type: "category", data: horas.map(h => h + 1), axisLabel: {...tx, interval: horas.length > 12 ? 1 : 0}, inverse: true},
      visualMap: {min: 0, max: mx || 1, calculable: true, orient: "horizontal", left: "center", bottom: 4, itemWidth: 14, itemHeight: 140,
        textStyle: {fontSize: FUENTE}, inRange: {color: ["#eef5fb", "#9cc3e6", "#f0b35a", "#c2410c", "#7f1d1d"]}},
      series: [{type: "heatmap", data: datos, progressive: 0}]}, true);
  }

  function graficoPerfil(r) {
    const anios = [...r.anio.keys()].sort();
    charts.perfil.setOption({
      animation: false, color: PALETA,
      grid: {left: 8, right: 14, top: 44, bottom: 34, containLabel: true},
      legend: {top: 0, textStyle: {fontSize: FUENTE}},
      tooltip: {trigger: "axis", textStyle: {fontSize: FUENTE}, valueFormatter: v => f1(v)},
      xAxis: {type: "category", name: "Hora", nameLocation: "middle", nameGap: 28, nameTextStyle: tx, data: Array.from({length: 24}, (_, h) => h + 1), axisLabel: {...tx, interval: 1}},
      yAxis: ejeY,
      series: anios.map(y => ({name: String(y), type: "line", symbol: "none", lineStyle: {width: 2},
        data: r.anio.get(y).map(a => a.n ? +prom(a).toFixed(2) : null)}))}, true);
  }

  function tabla(r) {
    const filas = [...r.mes.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1).filter(([, a]) => a.n);
    $("tbody").innerHTML = filas.map(([m, a]) =>
      `<tr><td>${esc(m)}</td><td class="num">${f1(prom(a))}</td><td class="num">${f1(a.mn)}</td><td class="num">${f1(a.mx)}</td></tr>`).join("")
      || '<tr><td colspan="4">Sin datos para el filtro</td></tr>';
  }

  function actualizar() {
    const r = calcular();
    kpis(r); tabla(r);
    if (charts.diario) { graficoDiario(r); graficoCalor(r); graficoPerfil(r); }
    $("kpi-ultimo").dataset.listo = "1";
  }
  const agendar = () => { clearTimeout(timer); timer = setTimeout(actualizar, 150); };

  // --- CSV ---
  function csv() {
    const mk = mascara(), out = ["fecha,hora,precio,tipo_dia"];
    for (const x of filtrar()) for (let h = 0; h < 24; h++) if (mk[h] && x.p[h] != null) out.push(`${x.f},${h + 1},${x.p[h]},${x.t}`);
    const url = URL.createObjectURL(new Blob([out.join("\n") + "\n"], {type: "text/csv;charset=utf-8"}));
    const a = document.createElement("a");
    a.href = url; a.download = `precio_bolsa_${$("desde").value}_${$("hasta").value}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- interfaz ---
  function chips(id, items, conjunto) {
    $(id).innerHTML = items.map(([v, t]) => `<button type="button" data-v="${esc(v)}" aria-pressed="false">${esc(t)}</button>`).join("");
    $(id).addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const v = +b.dataset.v, on = !conjunto.has(v);
      on ? conjunto.add(v) : conjunto.delete(v);
      b.setAttribute("aria-pressed", String(on)); agendar();
    });
  }

  function iniciar(d) {
    D = d; dias = indexar(d);
    $("meta").textContent = `${fechaLarga(d.desde)} a ${fechaLarga(d.hasta)}`;
    const fin = new Date(d.hasta + "T00:00:00Z"); fin.setUTCFullYear(fin.getUTCFullYear() - 1); fin.setUTCDate(fin.getUTCDate() + 1);
    $("desde").min = $("hasta").min = d.desde; $("desde").max = $("hasta").max = d.hasta;
    $("desde").value = fin.toISOString().slice(0, 10); $("hasta").value = d.hasta;
    const anios = [...new Set(dias.map(x => x.y))];
    chips("anios", anios.map(y => [y, y]), est.anios);
    chips("meses", MESES.map((t, i) => [i + 1, t]), est.meses);
    const opc = Array.from({length: 24}, (_, h) => `<option value="${h + 1}">H${h + 1} · ${hh(h)}</option>`).join("");
    $("h1").innerHTML = $("h2").innerHTML = opc; $("h2").value = "24";
    for (const id of ["desde", "hasta", "tipo", "h1", "h2"]) $(id).addEventListener("change", agendar);
    $("franja").addEventListener("change", () => { $("pers").hidden = $("franja").value !== "pers"; agendar(); });
    $("btn-csv").addEventListener("click", csv);
    if (typeof window.echarts === "undefined") {
      $("aviso").hidden = false;
      $("aviso").textContent = "No se pudo cargar la librería de gráficos (ECharts). Revise su conexión.";
    } else charts = {diario: echarts.init($("g-diario"), null, {renderer: "canvas"}), calor: echarts.init($("g-calor"), null, {renderer: "canvas"}), perfil: echarts.init($("g-perfil"), null, {renderer: "canvas"})};
    window.addEventListener("resize", () => Object.values(charts).forEach(c => c.resize()));
    actualizar();
  }

  // En la app local la página vive en /bolsa: los enlaces del encabezado apuntan a las rutas de la app.
  if (location.pathname.replace(/\/$/, "") === "/bolsa") {
    const rutas = {"index.html": "/", "dashboard.html": "/dashboard", "bolsa.html": "/bolsa"};
    document.querySelectorAll("nav a").forEach(a => { a.href = rutas[a.getAttribute("href")] || a.href; });
  }

  fetch("data/bolsa.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(iniciar)
    .catch(e => { $("kpi-ultimo").textContent = "Error"; $("vacio").style.display = "block"; $("vacio").textContent = "No se pudo cargar data/bolsa.json (" + e.message + ")"; });
})();
