// pliego.js — Renderiza la pestaña "Resumen del pliego" (sitio público y app local).
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const n0 = v => v == null ? "—" : Number(v).toLocaleString("es", {maximumFractionDigits: 0});
  const CURVA = {plana_24h: "Plana 24 h", plana_franja: "Plana en franja", variable: "Curva variable", no_indicado: "No indicado"};
  const DIA = {ordinario: "Ordinario", sabado: "Sábado", festivo: "Domingo/festivo", festivo_lunes: "Lunes festivo"};
  const COL = {ordinario: "#2E6FB0", sabado: "#1E8E5A", festivo: "#C2410C", festivo_lunes: "#7C3AED"};

  function fuente(d, exp) {
    if (!d || !d.fuente) return "";
    const pg = d.fuente.pagina ? `, pág. ${esc(d.fuente.pagina)}` : "";
    return ` <a class="src" href="${esc(exp)}" target="_blank" rel="noopener" title="Ver en el expediente oficial">[${esc(d.fuente.archivo)}${pg}]</a>`;
  }
  const val = (d, exp) => d && d.valor != null ? esc(d.valor) + fuente(d, exp) : '<span class="na">No indicado en el pliego</span>';
  const fila = (l, d, exp) => `<tr><th>${l}</th><td>${val(d, exp)}</td></tr>`;

  const igual = (u, v) => u.length === v.length && u.every((x, i) => Math.abs(x - v[i]) < 1e-6);
  function unir(nombres, todos) {
    if (todos) return "Todos los días";
    const ns = nombres.map((t, i) => { const d = DIA[t] || t; return i ? d.charAt(0).toLowerCase() + d.slice(1) : d; });
    return ns.length > 1 ? ns.slice(0, -1).join(", ") + " y " + ns[ns.length - 1] : ns[0];
  }

  function grafico(perfil) {
    const tipos = Object.keys(perfil || {}).filter(t => Array.isArray(perfil[t]) && perfil[t].length);
    if (!tipos.length) return "";
    const series = [];
    tipos.forEach(t => {
      const s = series.find(z => igual(z.v, perfil[t]));
      if (s) s.tipos.push(t); else series.push({tipos: [t], v: perfil[t]});
    });
    const W = 320, H = 190, PL = 44, PR = 10, PT = 26, PB = 26;
    const max = Math.max(...series.flatMap(z => z.v)) || 1;
    const x = i => PL + i * (W - PL - PR) / 23, y = v => H - PB - v / max * (H - PT - PB);
    const lineas = series.map(z => `<polyline fill="none" stroke="${COL[z.tipos[0]] || "#555"}" stroke-width="2"
      points="${z.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`).join("");
    const ejes = [1, 6, 12, 18, 24].map(h => `<text x="${x(h - 1)}" y="${H - 8}" font-size="12" text-anchor="middle" fill="currentColor">H${h}</text>`).join("");
    const ylab = `<text x="${PL - 5}" y="${y(0) + 4}" font-size="12" text-anchor="end" fill="currentColor">0</text>
      <text x="${PL - 5}" y="${y(max) + 4}" font-size="12" text-anchor="end" fill="currentColor">${n0(max)}</text>
      <text x="${PL}" y="12" font-size="12" fill="currentColor">MWh/h</text>`;
    const ley = series.map(z => `<span><i style="background:${COL[z.tipos[0]] || "#555"}"></i>${esc(unir(z.tipos, series.length === 1 && tipos.length > 1))}</span>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="perfil" role="img" aria-label="Perfil horario">
      <line x1="${PL}" y1="${y(0)}" x2="${W - PR}" y2="${y(0)}" stroke="currentColor" opacity=".3"/>
      ${ylab}${lineas}${ejes}</svg>
      <div class="ley">${ley}</div>`;
  }

  function periodo(r, exp) {
    const i = r.periodo_inicio, f = r.periodo_fin;
    const v = [i?.valor, f?.valor].filter(Boolean).join(" a ");
    if (!v) return fila("Período", null, exp);
    const mismo = !f?.fuente || !i?.fuente || (f.fuente.archivo === i.fuente.archivo && f.fuente.pagina === i.fuente.pagina);
    return `<tr><th>Período</th><td>${esc(v)}${fuente(i || f, exp)}${mismo ? "" : fuente(f, exp)}</td></tr>`;
  }

  function tarjetaProducto(num, q, r, exp, arch) {
    const curva = (q && q.tipo_curva) || (r && r.tipo_curva);
    const franja = q && q.franja ? ` (${esc(q.franja)})` : "";
    const anual = q ? Object.entries(q.mwh_anual || {}).map(([a, v]) => `<tr><td>${esc(a)}</td><td class="num">${n0(v)}</td></tr>`).join("") : "";
    const fa = q && arch.length ? `<div class="hint">Fuente: ${arch.map(a => `<a class="src" href="${esc(exp)}" target="_blank" rel="noopener" title="Ver en el expediente oficial">${esc(a)}</a>`).join("; ")}</div>` : "";
    return `<div class="prod">
      <h4>${esc(r ? r.nombre : "Producto " + num)} · <span class="curva">${esc(CURVA[curva] || "—")}${franja}</span></h4>
      <table class="kv">
        ${r ? periodo(r, exp) : ""}
        ${r ? fila("Horario", r.horario, exp) : ""}
        ${r ? fila("Tipo de contrato", r.tipo_contrato, exp) : ""}
        ${r ? fila("Cantidad", r.cantidad_resumen, exp) : ""}
        ${r ? `<tr><th>% mínimo a ofertar</th><td>${r.pct_minimo_oferta != null ? esc(r.pct_minimo_oferta) + " %" : '<span class="na">No indicado</span>'}</td></tr>` : ""}
        ${r ? fila("Reglas de oferta", r.reglas_oferta, exp) : ""}
        ${q ? `<tr><th>Total del anexo</th><td><b>${n0(q.total_mwh)} MWh</b></td></tr>` : ""}
      </table>
      ${q && q.perfil ? `<div class="hint">Perfil horario promedio ${esc(q.perfil_anio)} (MWh/h)</div>${grafico(q.perfil)}` : ""}
      ${anual ? `<details><summary>MWh por año</summary><table><thead><tr><th>Año</th><th>MWh</th></tr></thead><tbody>${anual}</tbody></table></details>` : ""}
      ${fa}
    </div>`;
  }

  // Número de producto de un resumen: el que sigue a "producto"/"prod" en `nombre` ("Lote 1 - Producto 3" -> 3);
  // si no, el primer número de 1-2 cifras ("Bloque 2 (2028)" -> 2); si no, su posición (1-based).
  // Mismo criterio que comun.numero_producto (Python).
  function numProducto(p, pos) {
    const nombre = (p && p.nombre) || "";
    const m = /\bprod(?:ucto)?\.?\s*(?:n[oº°]\.?\s*)?(\d{1,2})(?!\d)/i.exec(nombre)
      || /(?<!\d)(\d{1,2})(?!\d)/.exec(nombre);
    return m ? Number(m[1]) : pos;
  }

  window.renderPliego = function (el, pq, exp) {
    if (!pq) { el.innerHTML = '<div class="hint">Pliego pendiente de descarga y resumen.</div>'; return; }
    const r = pq.resumen, c = pq.cantidades;
    const qp = (c && c.productos) || {};
    const rp = (r && r.productos) || [];
    const rmap = {};
    rp.forEach((p, i) => { const n = numProducto(p, i + 1); if (!(n in rmap)) rmap[n] = p; });
    const nums = [...new Set([...Object.keys(qp).map(Number), ...Object.keys(rmap).map(Number)])].sort((a, b) => a - b);
    const al = pq.alertas || [];
    const alertas = al.length ? `<div class="alerta"><b>Revisar:</b><ul>${al.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "";
    const lista = (arr, exp) => arr && arr.length ? `<ul>${arr.map(d => `<li>${val(d, exp)}</li>`).join("")}</ul>` : '<span class="na">No indicado en el pliego</span>';
    el.innerHTML = `
      ${alertas}
      ${r ? `<p class="ejec">${esc(r.resumen_ejecutivo)}</p>` : '<div class="hint">Condiciones pendientes de resumen. Se muestran las cantidades del anexo.</div>'}
      ${!c || !Object.keys(qp).length ? `<div class="hint">Cantidades no disponibles${c ? " (anexo " + esc(String(c.estado || "").replace("_", " ")) + ")" : ""}.</div>` : ""}
      <h3>Productos</h3>
      <div class="prods">${nums.map(n => tarjetaProducto(n, qp[String(n)], rmap[n], exp, (c && c.archivos) || [])).join("") || '<div class="hint">Sin productos.</div>'}</div>
      ${r ? `
      <h3>Precio</h3><table class="kv">${fila("Tope / reserva", r.precio?.tope_o_reserva, exp)}${fila("Moneda base", r.precio?.moneda_base, exp)}
        ${fila("Indexación · índice", r.precio?.indexacion?.indice, exp)}${fila("Indexación · periodicidad", r.precio?.indexacion?.periodicidad, exp)}${fila("Indexación · base", r.precio?.indexacion?.base, exp)}</table>
      <h3>Garantías</h3><table class="kv">${fila("Seriedad de la oferta", r.garantias?.seriedad_oferta, exp)}${fila("Cumplimiento", r.garantias?.cumplimiento_contrato, exp)}${fila("Pago del comprador", r.garantias?.pago_comprador, exp)}</table>
      <h3>Adjudicación y fechas</h3><table class="kv">${fila("Criterio", r.criterio_adjudicacion, exp)}
        ${fila("Publicación", r.fechas?.publicacion, exp)}${fila("Consultas hasta", r.fechas?.consultas_hasta, exp)}${fila("Entrega de ofertas", r.fechas?.entrega_ofertas, exp)}${fila("Adjudicación", r.fechas?.adjudicacion, exp)}${fila("Firma del contrato", r.fechas?.firma_contrato, exp)}</table>
      <h3>Penalidades</h3>${lista(r.penalidades, exp)}
      <h3>FNCER</h3><table class="kv"><tr><th>Exclusivo FNCER</th><td>${r.fncer?.exclusivo == null ? '<span class="na">No indicado</span>' : r.fncer.exclusivo ? "Sí" : "No"}</td></tr>${fila("Requisitos", r.fncer?.requisitos, exp)}</table>
      <h3>Condiciones especiales</h3>${lista(r.condiciones_especiales, exp)}
      <p class="hint">Resumen generado por ${esc(pq.modelo === "claude-code" ? "Claude (carga inicial)" : pq.modelo || "Claude")}. Verifique en el pliego oficial antes de decidir.</p>` : ""}`;
  };
})();
