// producto_calc.js — cálculos puros para el PDF/Excel por producto (navegador: window.ProductoCalc; Node: module.exports).
(function (root) {
  "use strict";
  const PREF = {ordinario: ["ordinario", "sabado", "festivo", "festivo_lunes"],
                sabado: ["sabado", "ordinario", "festivo", "festivo_lunes"],
                festivo: ["festivo", "festivo_lunes", "ordinario", "sabado"],
                festivo_lunes: ["festivo_lunes", "festivo", "ordinario", "sabado"]};
  const BOLSA_TIPO = {laborable: "ordinario", sabado: "sabado", domingo_festivo: "festivo"};

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const diasMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dow = (s) => new Date(s + "T00:00:00Z").getUTCDay();   // 0 = domingo

  function codigoProducto(conv, n) { return `${conv}-PROD${pad(Number(n))}`; }

  function tipoDia(s, fest) {
    const w = dow(s), f = fest.has(s);
    if (f && w === 1) return "festivo_lunes";
    if (f || w === 0) return "festivo";
    return w === 6 ? "sabado" : "ordinario";
  }

  function tipoPerfil(t, disp) { return PREF[t].find((x) => disp.includes(x)) || disp[0]; }

  function perfilAnio(perfiles, anio, notas) {
    const anios = Object.keys(perfiles || {}).filter((a) => Object.keys(perfiles[a] || {}).length);
    if (!anios.length) return null;
    if (perfiles[anio] && Object.keys(perfiles[anio]).length) return perfiles[anio];
    const cerca = anios.reduce((b, a) => (Math.abs(+a - +anio) < Math.abs(+b - +anio) ? a : b));
    const n = `Año ${anio}: el anexo no trae perfil propio; se usa el de ${cerca}.`;
    if (!notas.includes(n)) notas.push(n);
    return perfiles[cerca];
  }

  function demandaHoraria(q, festivos, obligacion) {
    const fest = new Set(festivos || []), notas = [];
    let bloques = Object.entries(q.mwh_mensual || {}).map(([k, v]) => ({y: +k.slice(0, 4), m: +k.slice(5, 7), mwh: +v}));
    if (!bloques.length)
      bloques = Object.entries(q.mwh_anual || {}).map(([k, v]) => ({y: +k, m: 0, mwh: +v}));
    bloques.sort((a, b) => a.y - b.y || a.m - b.m);
    const fecha = [], tipo = [], hora = [], mwh = [];
    let fuera = 0;
    const fueraClaves = [];
    for (const b of bloques) {
      const meses = b.m ? [b.m] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const todos = [];
      for (const m of meses) for (let d = 1; d <= diasMes(b.y, m); d++) todos.push(iso(b.y, m, d));
      let dias = obligacion ? todos.filter((s) => s >= obligacion.inicio && s <= obligacion.fin) : todos;
      if (!dias.length) {   // bloque enteramente fuera de la obligación: se reparte en todos sus días
        dias = todos;
        if (b.mwh > 0) { fuera += b.mwh; fueraClaves.push(`${b.y}${b.m ? "-" + pad(b.m) : ""}`); }
      }
      let P = perfilAnio(q.perfiles, String(b.y), notas);
      if (!P) {
        P = {ordinario: Array(24).fill(1)};
        const n = "El anexo no trae perfil horario; se reparte plano por hora.";
        if (!notas.includes(n)) notas.push(n);
      }
      const disp = Object.keys(P);
      const crudo = [];
      let suma = 0;
      for (const s of dias) {
        const t = tipoDia(s, fest), curva = P[tipoPerfil(t, disp)] || [];
        for (let h = 0; h < 24; h++) { const v = +curva[h] || 0; crudo.push(v); suma += v; }
      }
      const uniforme = suma <= 0;
      if (uniforme && b.mwh > 0) notas.push(`${b.y}${b.m ? "-" + pad(b.m) : ""}: el perfil suma 0 en los días del periodo; reparto uniforme por hora.`);
      const k = uniforme ? b.mwh / crudo.length : b.mwh / suma;
      let i = 0;
      for (const s of dias) {
        const t = tipoDia(s, fest);
        for (let h = 1; h <= 24; h++, i++) {
          fecha.push(s); tipo.push(t); hora.push(h); mwh.push(uniforme ? k : crudo[i] * k);
        }
      }
    }
    if (fuera > 0) {
      const tot = bloques.reduce((a, b) => a + b.mwh, 0);
      const pct = tot ? Math.round((fuera / tot) * 1000) / 10 : 0;
      const f = (x) => Math.round(x).toLocaleString("es-CO");
      notas.push(`${f(fuera)} MWh (${pct} % del total) del anexo están en meses fuera del periodo de obligación SICEP (${fueraClaves[0]} a ${fueraClaves[fueraClaves.length - 1]}; obligación ${obligacion.inicio} a ${obligacion.fin}); se incluyen tal como vienen en el anexo — revisar.`);
    }
    return {fecha, tipo, hora: Int8Array.from(hora), mwh: Float64Array.from(mwh), mwh_fuera_obligacion: fuera, notas};
  }

  function agrupar(dem, largo) {
    const o = {};
    for (let i = 0; i < dem.fecha.length; i++) { const k = dem.fecha[i].slice(0, largo); o[k] = (o[k] || 0) + dem.mwh[i]; }
    return o;
  }
  const mensualDesde = (dem) => agrupar(dem, 7);
  const anualDesde = (dem) => agrupar(dem, 4);

  function referenciaBolsa(bolsa, dias = 365) {
    const n = bolsa.fechas.length, ini = Math.max(0, n - dias);
    const acc = {ordinario: [], sabado: [], festivo: []};
    for (const t in acc) for (let h = 0; h < 24; h++) acc[t].push([0, 0]);
    for (let i = ini; i < n; i++) {
      const t = BOLSA_TIPO[bolsa.tipo[i]] || "ordinario", fila = bolsa.p[i] || [];
      for (let h = 0; h < 24; h++) { const v = fila[h]; if (v != null && isFinite(v)) { acc[t][h][0] += +v; acc[t][h][1]++; } }
    }
    const out = {desde: bolsa.fechas[ini], hasta: bolsa.fechas[n - 1]};
    for (const t in acc) out[t] = acc[t].map(([s, c]) => (c ? s / c : null));
    return out;
  }

  function costoComparado(dem, ref, precio) {
    const notas = [], por = {};
    let sinPrecio = 0;
    for (let i = 0; i < dem.fecha.length; i++) {
      const a = dem.fecha[i].slice(0, 4), t = dem.tipo[i] === "festivo_lunes" ? "festivo" : dem.tipo[i];
      const p = (ref[t] || [])[dem.hora[i] - 1];
      const r = por[a] || (por[a] = {anio: a, mwh: 0, mwh_con_precio: 0, costo_bolsa: 0});
      r.mwh += dem.mwh[i];
      if (p == null) { sinPrecio++; continue; }
      r.mwh_con_precio += dem.mwh[i]; r.costo_bolsa += dem.mwh[i] * 1000 * p;
    }
    if (sinPrecio) notas.push(`${sinPrecio} horas sin precio de bolsa de referencia; la comparación (costo a bolsa, costo adjudicado y diferencia) cubre solo las horas con precio.`);
    const fila = (r) => {
      const adj = precio == null ? null : r.mwh_con_precio * 1000 * precio;
      return {anio: r.anio, mwh: r.mwh, costo_bolsa: r.costo_bolsa, costo_adjudicado: adj,
              diferencia: adj == null ? null : adj - r.costo_bolsa,
              precio_bolsa_curva: r.mwh_con_precio ? r.costo_bolsa / (r.mwh_con_precio * 1000) : null};
    };
    const filas = Object.values(por).sort((x, y) => x.anio.localeCompare(y.anio)).map(fila);
    const tot = Object.values(por).reduce((s, r) => ({anio: "Total", mwh: s.mwh + r.mwh, mwh_con_precio: s.mwh_con_precio + r.mwh_con_precio,
      costo_bolsa: s.costo_bolsa + r.costo_bolsa}), {anio: "Total", mwh: 0, mwh_con_precio: 0, costo_bolsa: 0});
    return {filas, total: fila(tot), notas};
  }

  const val = (d) => (d && typeof d === "object" ? d.valor ?? null : d ?? null);
  const pag = (d) => (d && d.fuente && d.fuente.pagina != null ? d.fuente.pagina : null);
  const item = (t, d) => ({t, v: val(d), pag: pag(d)});

  function numResumen(p, pos) {
    const nombre = (p && p.nombre) || "";
    const m = /\bprod(?:ucto)?\.?\s*(?:n[oº°]\.?\s*)?(\d{1,2})(?!\d)/i.exec(nombre) || /(?<!\d)(\d{1,2})(?!\d)/.exec(nombre);
    return m ? Number(m[1]) : pos;
  }

  function resumenProducto(conv, productos, paquete, n) {
    const codigo = codigoProducto(conv.convocatoria, n);
    const s = (productos || []).find((p) => p.producto === codigo) || null;
    const cant = (paquete && paquete.cantidades) || {};
    const q = (cant.productos || {})[String(n)] || {};
    const r = (paquete && paquete.resumen) || {};
    const rp = (r.productos || []).find((p, i) => numResumen(p, i + 1) === Number(n)) || null;
    const dem = s && s.energia_demandada_gwh, adj = s && s.energia_adjudicada_gwh;
    const ix = (r.precio && r.precio.indexacion) || {};
    const g = r.garantias || {};
    return {
      codigo, nombre: (rp && rp.nombre) || `Producto ${n}`, conv: conv.convocatoria,
      comprador: conv.agente_comprador, mercado: conv.mercado, estado: conv.estado, fncer: !!conv.exclusivo_fncer,
      total_mwh: q.total_mwh ?? null, mwh_anual: q.mwh_anual || {}, tipo_curva: q.tipo_curva || (rp && rp.tipo_curva) || null,
      franja: q.franja || null,
      periodo: rp ? [val(rp.periodo_inicio), val(rp.periodo_fin)].filter(Boolean).join(" a ") : null,
      horario: rp ? val(rp.horario) : null,
      tipo_contrato: (s && s.tipo_contrato) || (rp ? val(rp.tipo_contrato) : null),
      precio: s && s.precio_prom_adjudicado != null && +s.precio_prom_adjudicado > 0 ? +s.precio_prom_adjudicado : null,   // SICEP publica 0 sin adjudicar
      indexacion: {indice: val(ix.indice), periodicidad: val(ix.periodicidad), base: val(ix.base),
                   pag: {indice: pag(ix.indice), periodicidad: pag(ix.periodicidad), base: pag(ix.base)}},
      moneda_base: val(r.precio && r.precio.moneda_base),
      demandada_gwh: dem ?? null, adjudicada_gwh: adj ?? null,
      pct_adjudicado: dem && adj != null ? Math.round((adj / dem) * 1000) / 10 : null,
      estado_cantidades: cant.estado || null, descartes: q.descartes || [],
      condiciones: {
        garantias: [item("Seriedad de la oferta", g.seriedad_oferta), item("Cumplimiento", g.cumplimiento_contrato),
                    item("Pago del comprador", g.pago_comprador)].filter((x) => x.v),
        penalidades: (r.penalidades || []).map((d) => item("Penalidad", d)).filter((x) => x.v),
        criterio: item("Criterio de adjudicación", r.criterio_adjudicacion),
        especiales: (r.condiciones_especiales || []).map((d) => item("Condición especial", d)).filter((x) => x.v),
      },
      obligacion: s && s.inicio_obligacion && s.fin_obligacion
        ? {inicio: String(s.inicio_obligacion).slice(0, 10), fin: String(s.fin_obligacion).slice(0, 10)} : null,
    };
  }

  const PDF_MAP = {"–": "-", "—": "-", "→": "->", "≈": "~", "≤": "<=", "≥": ">=", "·": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...", "•": "-"};
  function pdfTxt(s) {
    if (s == null) return "";
    return String(s).replace(/[^\x00-\xFF]|·|[\x80-\x9F]/g, (ch) => (ch >= "\x80" && ch <= "\x9F" ? "" : PDF_MAP[ch] ?? "?"));
  }

  const API = {codigoProducto, tipoDia, tipoPerfil, demandaHoraria, mensualDesde, anualDesde,
               referenciaBolsa, costoComparado, resumenProducto, pdfTxt};
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ProductoCalc = API;
})(typeof self !== "undefined" ? self : this);
