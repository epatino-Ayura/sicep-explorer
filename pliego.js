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

  function grafico(perfil) {
    const tipos = Object.keys(perfil || {}).filter(t => Array.isArray(perfil[t]) && perfil[t].length);
    if (!tipos.length) return "";
    const W = 560, H = 180, P = 28;
    const max = Math.max(...tipos.flatMap(t => perfil[t])) || 1;
    const x = i => P + i * (W - 2 * P) / 23, y = v => H - P - v / max * (H - 2 * P);
    const lineas = tipos.map(t => `<polyline fill="none" stroke="${COL[t] || "#555"}" stroke-width="2"
      points="${perfil[t].map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`).join("");
    const ejes = [1, 6, 12, 18, 24].map(h => `<text x="${x(h - 1)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="currentColor">H${h}</text>`).join("");
    const ley = tipos.map(t => `<span><i style="background:${COL[t] || "#555"}"></i>${esc(DIA[t] || t)}</span>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="perfil" role="img" aria-label="Perfil horario">
      <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="currentColor" opacity=".3"/>
      <text x="${P}" y="${P - 8}" font-size="10" fill="currentColor">${n0(max)} MWh/h</text>${lineas}${ejes}</svg>
      <div class="ley">${ley}</div>`;
  }

  function tarjetaProducto(num, q, r, exp) {
    const curva = (q && q.tipo_curva) || (r && r.tipo_curva);
    const franja = q && q.franja ? ` (${esc(q.franja)})` : "";
    const anual = q ? Object.entries(q.mwh_anual || {}).map(([a, v]) => `<tr><td>${esc(a)}</td><td class="num">${n0(v)}</td></tr>`).join("") : "";
    return `<div class="prod">
      <h4>${esc(r ? r.nombre : "Producto " + num)} · <span class="curva">${esc(CURVA[curva] || "—")}${franja}</span></h4>
      <table class="kv">
        ${r ? fila("Período", {valor: [r.periodo_inicio?.valor, r.periodo_fin?.valor].filter(Boolean).join(" a ") || null, fuente: r.periodo_inicio?.fuente}, exp) : ""}
        ${r ? fila("Horario", r.horario, exp) : ""}
        ${r ? fila("Tipo de contrato", r.tipo_contrato, exp) : ""}
        ${r ? fila("Cantidad", r.cantidad_resumen, exp) : ""}
        ${r ? `<tr><th>% mínimo a ofertar</th><td>${r.pct_minimo_oferta != null ? esc(r.pct_minimo_oferta) + " %" : '<span class="na">No indicado</span>'}</td></tr>` : ""}
        ${r ? fila("Reglas de oferta", r.reglas_oferta, exp) : ""}
        ${q ? `<tr><th>Total del anexo</th><td><b>${n0(q.total_mwh)} MWh</b></td></tr>` : ""}
      </table>
      ${q && q.perfil ? `<div class="hint">Perfil horario promedio ${esc(q.perfil_anio)} (MWh/h)</div>${grafico(q.perfil)}` : ""}
      ${anual ? `<details><summary>MWh por año</summary><table><thead><tr><th>Año</th><th>MWh</th></tr></thead><tbody>${anual}</tbody></table></details>` : ""}
    </div>`;
  }

  window.renderPliego = function (el, pq, exp) {
    if (!pq) { el.innerHTML = '<div class="hint">Pliego pendiente de descarga y resumen.</div>'; return; }
    const r = pq.resumen, c = pq.cantidades;
    const qp = (c && c.productos) || {};
    const rp = (r && r.productos) || [];
    const nums = [...new Set([...Object.keys(qp).map(Number), ...rp.map((_, i) => i + 1)])].sort((a, b) => a - b);
    const al = pq.alertas || [];
    const alertas = al.length ? `<div class="alerta"><b>Revisar:</b><ul>${al.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "";
    const lista = (arr, exp) => arr && arr.length ? `<ul>${arr.map(d => `<li>${val(d, exp)}</li>`).join("")}</ul>` : '<span class="na">No indicado en el pliego</span>';
    el.innerHTML = `
      ${alertas}
      ${r ? `<p class="ejec">${esc(r.resumen_ejecutivo)}</p>` : '<div class="hint">Condiciones pendientes de resumen. Se muestran las cantidades del anexo.</div>'}
      ${!c || !Object.keys(qp).length ? `<div class="hint">Cantidades no disponibles${c ? " (anexo " + esc(String(c.estado || "").replace("_", " ")) + ")" : ""}.</div>` : ""}
      <h3>Productos</h3>
      <div class="prods">${nums.map(n => tarjetaProducto(n, qp[String(n)], rp[n - 1], exp)).join("") || '<div class="hint">Sin productos.</div>'}</div>
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
