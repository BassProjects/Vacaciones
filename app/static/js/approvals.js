import { apiFetch } from './api.js';
import { esc, fmtDate, fmtDateTime, fmtDays } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {deptPillHtml, typeName} = ctx.calls;
  function getApprovableRequests(status) {
    return APP.requests.filter(r => r.status === status && r.canApprove);
  }

  function renderApprovalsView() {
    const pending = getApprovableRequests("pending").sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
    const approved = getApprovableRequests("approved").sort((a, b) => b.dateFrom.localeCompare(a.dateFrom));
    return `
      <div class="page-header"><h1>Aprobaciones</h1><p>Resuelve las solicitudes de tu equipo.</p></div>
      <div class="tabs">
        <button type="button" class="tab-btn ${
          APP.approvalsTab === "pendientes" ? "active" : ""
        }" data-action="approvals-tab" data-tab="pendientes">Pendientes${
      pending.length
        ? ` <span class="nav-badge" style="background:var(--amber-bg);color:var(--amber-fg)">${pending.length}</span>`
        : ""
    }</button>
        <button type="button" class="tab-btn ${
          APP.approvalsTab === "aprobadas" ? "active" : ""
        }" data-action="approvals-tab" data-tab="aprobadas">Aprobadas</button>
      </div>
      ${APP.approvalsTab === "pendientes" ? renderPendingList(pending) : renderApprovedList(approved)}
    `;
  }

  function renderPendingList(list) {
    if (!list.length) return `<div class="empty-state">No hay solicitudes pendientes.</div>`;
    return list
      .map(
        (r) => `
      <div class="req-card">
        <div class="req-card-top">
          <div>
            <div class="req-card-name">${esc(r.userName)}</div>
            <div class="req-card-meta">${deptPillHtml(r.department)} · ${esc(typeName(r.type))}</div>
          </div>
          <span class="badge badge-pending">Pendiente</span>
        </div>
        <div class="req-card-dates">${fmtDate(r.dateFrom)} → ${fmtDate(r.dateTo)} · ${fmtDays(r.days)} días${
          r.halfStart || r.halfEnd ? " (con medio día)" : ""
        }</div>
        <div class="faint">Solicitada el ${fmtDateTime(r.requestedAt)}</div>
        ${r.note ? `<div class="req-card-note">${esc(r.note)}</div>` : ""}
        <div class="req-card-actions">
          <button type="button" class="btn btn-success btn-sm" data-action="approve-request" data-id="${r.id}" ${
          APP.actionLoadingId === r.id ? "disabled" : ""
        }>Aprobar</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="open-reject-modal" data-id="${r.id}" ${
          APP.actionLoadingId === r.id ? "disabled" : ""
        }>Rechazar</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  function renderApprovedList(list) {
    if (!list.length) return `<div class="empty-state">No hay solicitudes aprobadas.</div>`;
    return list
      .map(
        (r) => `
      <div class="req-card">
        <div class="req-card-top">
          <div>
            <div class="req-card-name">${esc(r.userName)}</div>
            <div class="req-card-meta">${deptPillHtml(r.department)} · ${esc(typeName(r.type))}</div>
          </div>
          <span class="badge badge-approved">Aprobada</span>
        </div>
        <div class="req-card-dates">${fmtDate(r.dateFrom)} → ${fmtDate(r.dateTo)} · ${fmtDays(r.days)} días</div>
        <div class="faint">Solicitada el ${fmtDateTime(r.requestedAt)}</div>
        <div class="faint">Aprobada el ${fmtDateTime(r.resolvedAt)} por ${esc(r.resolvedBy || "—")}</div>
        ${r.note ? `<div class="req-card-note">${esc(r.note)}</div>` : ""}
        <div class="req-card-actions">
          <button type="button" class="btn btn-outline btn-sm" data-action="open-cancel-modal" data-id="${r.id}">Cancelar</button>
        </div>
      </div>
    `
      )
      .join("");
  }
  return {getApprovableRequests, renderApprovalsView, renderPendingList, renderApprovedList};
}
