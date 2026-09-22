import { apiFetch } from './api.js';
import { currentYear, currentYearMonth, esc, fmtDays, todayISO as todayInMadrid } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  function workersForRequests(requests) {
    const daysByUser = new Map();
    const nameByUser = new Map();
    for (const r of requests) {
      daysByUser.set(r.userId, (daysByUser.get(r.userId) || 0) + Number(r.days));
      nameByUser.set(r.userId, r.userName);
    }
    return [...daysByUser.entries()]
      .map(([userId, days]) => ({ userId, name: nameByUser.get(userId), days }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function computeTypeWorkerCounts() {
    return APP.adminReport || {year:currentYear(), totalActive:0, byType:[]};
  }

  function computeDepartmentTypeCounts() {
    return APP.adminReport?.byDepartment || [];
  }

  function reportValuePopoverHtml(valueText, title, lines) {
    if (!lines.length) return `<div class="report-bar-value mono">${esc(valueText)}</div>`;
    const rows = lines
      .map(
        (l) => `
        <div class="report-value-row">
          <span>${esc(l.name)}${l.typeLabel ? ` · ${esc(l.typeLabel)}` : ""}</span>
          <span class="mono">${fmtDays(l.days)} día${fmtDays(l.days) === "1" ? "" : "s"}</span>
        </div>
      `
      )
      .join("");
    return `
      <div class="report-value-wrap" data-action="toggle-report-popover">
        <div class="report-bar-value mono">${esc(valueText)}</div>
        <div class="report-value-popover">
          <div class="popover-name">${esc(title)}</div>
          ${rows}
        </div>
      </div>
    `;
  }

  function reportBarRow(label, pct, valueText, color, workers = []) {
    return `
      <div class="report-bar-row">
        <div class="report-bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="report-bar-track"><div class="report-bar-fill" style="width:${Math.min(
          100,
          Math.max(0, pct)
        )}%;background:${color}"></div></div>
        ${reportValuePopoverHtml(valueText, label, workers)}
      </div>
    `;
  }

  function reportStackedBarRow(label, segments, maxTotal) {
    const total = segments.reduce((s, seg) => s + seg.count, 0);
    const totalWidthPct = maxTotal > 0 ? Math.min(100, (total / maxTotal) * 100) : 0;
    const segmentsHtml = segments
      .filter((seg) => seg.count > 0)
      .map((seg) => {
        const widthPct = total > 0 ? (seg.count / total) * 100 : 0;
        return `<div class="stacked-bar-seg" style="width:${widthPct}%;background:${seg.color}" title="${esc(
          seg.label
        )}: ${seg.count}"></div>`;
      })
      .join("");
    const lines = segments
      .flatMap((seg) => (seg.workers || []).map((w) => ({ name: w.name, typeLabel: seg.label, days: w.days })))
      .sort((a, b) => a.name.localeCompare(b.name));
    return `
      <div class="report-bar-row">
        <div class="report-bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="report-bar-track"><div class="stacked-bar-fill" style="width:${totalWidthPct}%">${segmentsHtml}</div></div>
        ${reportValuePopoverHtml(`${total} recuentos por motivo`, label, lines)}
      </div>
    `;
  }

  function computeGlobalAwayGauge() {
    return APP.adminReport?.away || {awayCount:0,total:0,pct:0,overLimit:false};
  }

  function renderGlobalGauge() {
    const g = computeGlobalAwayGauge();
    return `
      <div class="card">
        <div class="flex-between">
          <div class="section-title" style="margin-bottom:0">Varómetro global de ausencias (hoy)</div>
          <span class="badge ${g.overLimit ? "badge-rejected" : "badge-approved"}">${
      g.overLimit ? "Supera el límite" : "Dentro del límite"
    }</span>
        </div>
        <p class="faint" style="margin:6px 0 14px">Trabajadores de vacaciones, de baja o ausentes por cualquier motivo hoy, sobre el total de la plantilla activa. Umbral visual configurado: ${(APP.config?.maxAwayPercent || 30)}%.</p>
        <div class="gauge-wrap">
          <div class="gauge-track"><div class="gauge-fill ${
            g.overLimit ? "warn" : "ok"
          }" style="width:${Math.min(100, g.pct)}%"></div></div>
          <div class="gauge-marker" style="left:${(APP.config?.maxAwayPercent || 30)}%" title="Límite: ${(APP.config?.maxAwayPercent || 30)}%"></div>
        </div>
        <div class="faint" style="margin-top:18px">${g.awayCount} de ${g.total} trabajadores ausentes hoy · <b class="${
      g.overLimit ? "gauge-pct-warn" : "gauge-pct-ok"
    }">${g.pct}%</b></div>
      </div>
    `;
  }

  function renderAdminReports() {
    const company = computeTypeWorkerCounts();
    const deptReport = computeDepartmentTypeCounts();

    const typeBars = company.byType
      .map((t) => {
        const pct = company.totalActive > 0 ? Math.round((t.count / company.totalActive) * 100) : 0;
        return reportBarRow(
          t.type.name,
          pct,
          `${t.count} trabajador${t.count === 1 ? "" : "es"}`,
          t.type.color,
          t.workers
        );
      })
      .join("");

    const maxDeptTotal = Math.max(1, ...deptReport.map((d) => d.total));
    const typeLegendHtml = APP.absenceTypes
      .map(
        (t) =>
          `<span class="type-legend-item"><span class="dept-dot" style="background:${t.color}"></span>${esc(
            t.name
          )}</span>`
      )
      .join("");
    const deptBars = deptReport
      .map((d) =>
        reportStackedBarRow(
          `${d.dept.name} (${d.employeeCount})`,
          d.byType.map((t) => ({ label: t.type.name, count: t.count, color: t.type.color, workers: t.workers })),
          maxDeptTotal
        )
      )
      .join("");

    return `
      ${renderGlobalGauge()}
      <div class="page-header" style="margin-bottom:12px">
        <h1 style="font-size:16px">Trabajadores por motivo de ausencia · ${company.year}</h1>
        <p>Empleados activos con al menos una solicitud aprobada de cada tipo este año, sobre ${
          company.totalActive
        } empleados activos en total.</p>
      </div>
      <div class="card">
        <div class="report-bars">${
          typeBars || `<div class="empty-state">No hay empleados activos.</div>`
        }</div>
      </div>
      <div class="card">
        <div class="section-title">Por departamento</div>
        <div class="type-legend" style="margin-bottom:14px">${typeLegendHtml}</div>
        <div class="report-bars">${
          deptBars || `<div class="empty-state">No hay departamentos con empleados.</div>`
        }</div>
      </div>
      <div class="faint">Una persona puede aparecer en varios motivos. Los saldos definitivos por empleado se consultan en la pestaña "Empleados".</div>
      <div class="card">
        <div class="section-title">Histórico (Calamari)</div>
        <p class="faint" style="margin-bottom:12px">Importa ausencias antiguas desde una exportación "Detailed timesheet" de Calamari, o exporta el histórico de este sistema en el mismo formato.</p>
        <div class="timesheet-io-row">
          <button type="button" class="btn btn-outline btn-sm" data-action="open-import-calamari-modal">Importar histórico de Calamari</button>
          <form method="GET" action="/api/reports/timesheet-export" target="_blank" class="export-timesheet-form">
            <input type="month" name="ym" value="${currentYearMonth()}" required />
            <select name="userId">
              <option value="all">Todos los trabajadores</option>
              ${APP.users
                .map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`)
                .join("")}
            </select>
            <button type="submit" class="btn btn-outline btn-sm">Exportar Excel</button>
          </form>
        </div>
      </div>
    `;
  }
  return {workersForRequests, computeTypeWorkerCounts, computeDepartmentTypeCounts, reportValuePopoverHtml, reportBarRow, reportStackedBarRow, computeGlobalAwayGauge, renderGlobalGauge, renderAdminReports};
}
