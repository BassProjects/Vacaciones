import { apiFetch } from './api.js';
import { STATUS_BADGE_CLASS, STATUS_LABELS, computeAllowance, currentYear, esc, fmtDate, fmtDateTime, fmtDays, roleLabel } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {deptPillHtml, renderAdminReports, typeName} = ctx.calls;
  function renderAdminView() {
    return `
      <div class="page-header"><h1>Administración</h1><p>Gestiona empleados, festivos y solicitudes.</p></div>
      <div class="tabs">
        <button type="button" class="tab-btn ${
          APP.adminTab === "empleados" ? "active" : ""
        }" data-action="admin-tab" data-tab="empleados">Empleados</button>
        <button type="button" class="tab-btn ${
          APP.adminTab === "festivos" ? "active" : ""
        }" data-action="admin-tab" data-tab="festivos">Días festivos</button>
        <button type="button" class="tab-btn ${
          APP.adminTab === "solicitudes" ? "active" : ""
        }" data-action="admin-tab" data-tab="solicitudes">Todas las solicitudes</button>
        <button type="button" class="tab-btn ${
          APP.adminTab === "informes" ? "active" : ""
        }" data-action="admin-tab" data-tab="informes">Informes</button>
        <button type="button" class="tab-btn ${
          APP.adminTab === "avanzado" ? "active" : ""
        }" data-action="admin-tab" data-tab="avanzado">Avanzado</button>
      </div>
      ${APP.adminTab === "empleados" ? renderAdminEmployees() : ""}
      ${APP.adminTab === "festivos" ? renderAdminHolidays() : ""}
      ${APP.adminTab === "solicitudes" ? renderAdminAllRequests() : ""}
      ${APP.adminTab === "informes" ? renderAdminReports() : ""}
      ${APP.adminTab === "avanzado" ? renderAdminDangerZone() : ""}
    `;
  }

  function renderAdminDangerZone() {
    return `<section class="card"><h2>Configuración y trazabilidad</h2>
      <p>Calendarios, jornadas, concesiones anuales, arrastres, delegaciones, cobertura y correo.</p>
      <p>Desactivar un empleado conserva sus solicitudes y justificantes. El borrado masivo no está disponible.</p>
      <a class="btn btn-primary" href="/admin">Abrir configuración y auditoría</a></section>`;
  }

  function renderAdminEmployees() {
    const year = currentYear();
    const rows = APP.users
      .map((u) => {
        const info = computeAllowance(u, APP.requests, year, APP.config.defaultAllowance);
        return `
        <tr>
          <td>${esc(u.name)}</td>
          <td class="mono">${esc(u.username)}</td>
          <td>${u.department ? deptPillHtml(u.department) : '<span class="faint">—</span>'}</td>
          <td>${roleLabel(u.role)}</td>
          <td class="mono">${u.birthDate ? fmtDate(u.birthDate) : '<span class="faint">—</span>'}</td>
          <td class="mono">${fmtDays(info.allowance)}</td>
          <td class="mono">${fmtDays(info.consumed)}</td>
          <td class="mono" style="color:var(--green-fg);font-weight:700">${fmtDays(info.remaining)}</td>
          <td>${
            u.active
              ? '<span class="badge badge-approved">Activo</span>'
              : '<span class="badge badge-cancelled">Inactivo</span>'
          }</td>
          <td>
            <div style="display:flex;gap:6px">
              <button type="button" class="btn btn-outline btn-sm" data-action="open-edit-worker-modal" data-id="${u.id}">Editar</button>
              <button type="button" class="btn btn-outline btn-sm" data-action="open-reset-password-modal" data-id="${u.id}">Contraseña</button>
              ${
                u.id !== APP.me.id
                  ? `<button type="button" class="btn btn-danger btn-sm" data-action="open-delete-worker-modal" data-id="${u.id}">Desactivar</button>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
      })
      .join("");

    return `
      <div class="card">
        <div class="flex-between" style="margin-bottom:16px">
          <div class="section-title" style="margin-bottom:0">Empleados (${APP.users.length})</div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-outline btn-sm" data-action="open-invite-modal">Invitar por correo</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="open-add-worker-modal">+ Añadir trabajador</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Nombre</th><th>Usuario</th><th>Departamento</th><th>Rol</th><th>Cumpleaños</th>
              <th>Días/año</th><th>Consumidos</th><th>Restantes</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>${rows || `<tr class="empty-row"><td colspan="10">No hay trabajadores</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAdminHolidays() {
    const byYear = {};
    APP.holidays.forEach((h) => {
      const y = h.date.slice(0, 4);
      (byYear[y] = byYear[y] || []).push(h);
    });
    const years = Object.keys(byYear).sort();
    const sections = years
      .map(
        (y) => `
      <div class="card">
        <div class="section-title">${y}</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Nombre</th><th></th></tr></thead>
            <tbody>
              ${byYear[y]
                .map(
                  (h) => `
                <tr>
                  <td class="mono">${fmtDate(h.date)}</td>
                  <td class="wrap">${esc(h.name)}</td>
                  <td><button type="button" class="btn btn-outline btn-sm" data-action="delete-holiday" data-date="${h.date}">Borrar</button></td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `
      )
      .join("");

    return `
      <div class="flex-between" style="margin-bottom:16px">
        <div></div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-outline btn-sm" data-action="open-import-holidays-modal">Importar desde archivo</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-add-holiday-modal">+ Añadir festivo</button>
        </div>
      </div>
      ${sections || `<div class="empty-state">No hay festivos configurados.</div>`}
    `;
  }

  function renderAdminAllRequests() {
    const list = APP.requests;
    const rows = list
      .map(
        (r) => `
      <tr>
        <td>${esc(r.userName)}</td>
        <td>${deptPillHtml(r.department)}</td>
        <td>${esc(typeName(r.type))}</td>
        <td class="mono">${fmtDate(r.dateFrom)} → ${fmtDate(r.dateTo)}</td>
        <td class="mono">${fmtDays(r.days)}</td>
        <td><span class="badge ${STATUS_BADGE_CLASS[r.status]}">${STATUS_LABELS[r.status]}</span></td>
        <td class="mono">${fmtDateTime(r.requestedAt)}</td>
      </tr>
    `
      )
      .join("");

    return `
      <div class="card">
        <div class="section-title">${list.length} solicitudes del período cargado</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Trabajador</th><th>Departamento</th><th>Tipo</th><th>Fechas</th><th>Días</th><th>Estado</th><th>Solicitada</th></tr></thead>
            <tbody>${rows || `<tr class="empty-row"><td colspan="7">No hay solicitudes</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }
  return {renderAdminView, renderAdminDangerZone, renderAdminEmployees, renderAdminHolidays, renderAdminAllRequests};
}
