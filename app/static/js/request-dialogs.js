import { apiFetch } from './api.js';
import { workerManagementModal } from './worker-management.js';
import { esc, fmtDate, fmtDays, passwordFieldHtml } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {renderAddHolidayModal, renderAttachmentsModal, renderDeleteWorkerModal, renderEditProfileModal, renderImportCalamariModal, renderImportHolidaysModal, renderInviteWorkersModal, renderOverlapModal, renderResetPasswordModal, renderWorkerFormModal} = ctx.calls;
  function renderModal() {
    const m = APP.modal;
    if (!m) return "";
    let inner = "";
    let wide = false;
    if (m.type === "reject") inner = renderRejectModal();
    else if (m.type === "cancel") inner = renderCancelModal();
    else if (m.type === "confirmOverAllowance") inner = renderConfirmOverAllowanceModal(m.extra);
    else if (m.type === "addWorker") inner = renderWorkerFormModal(null);
    else if (m.type === "inviteWorkers") inner = renderInviteWorkersModal();
    else if (m.type === "manageWorker") inner = workerManagementModal(APP);
    
    else if (m.type === "editWorker") inner = renderWorkerFormModal(APP.users.find((u) => u.id === m.userId));
    else if (m.type === "resetPassword") inner = renderResetPasswordModal();
    else if (m.type === "deleteWorker") inner = renderDeleteWorkerModal();
    else if (m.type === "addHoliday") inner = renderAddHolidayModal();
    else if (m.type === "changePassword") inner = renderChangePasswordModal();
    else if (m.type === "editProfile") inner = renderEditProfileModal();
    else if (m.type === "importHolidays") {
      inner = renderImportHolidaysModal();
      wide = true;
    } else if (m.type === "importCalamari") {
      inner = renderImportCalamariModal();
      wide = true;
    } else if (m.type === "attachments") {
      inner = renderAttachmentsModal(m);
    } else if (m.type === "overlap") {
      inner = renderOverlapModal(m);
      wide = true;
    }
    return `<div class="modal-overlay"><div class="modal-box${wide ? " modal-box-wide" : ""}">${inner}</div></div>`;
  }

  function renderRejectModal() {
    const r = APP.requests.find((x) => x.id === APP.modal.requestId);
    return `
      <div class="modal-title">Rechazar solicitud</div>
      <div class="modal-sub">${r ? `${esc(r.userName)} · ${fmtDate(r.dateFrom)} → ${fmtDate(r.dateTo)}` : ""}</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="reject-form">
        <div class="field">
          <label>Motivo (opcional)</label>
          <textarea name="decisionNote" placeholder="Explica el motivo del rechazo…"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-danger" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Rechazando…" : "Rechazar solicitud"
    }</button>
        </div>
      </form>
    `;
  }

  function renderCancelModal() {
    const r = APP.requests.find((x) => x.id === APP.modal.requestId);
    return `
      <div class="modal-title">Cancelar solicitud aprobada</div>
      <div class="modal-sub">Los días de esta solicitud volverán a estar disponibles para el trabajador.</div>
      ${
        r
          ? `<div class="req-card-dates" style="margin-bottom:12px">${esc(r.userName)} · ${fmtDate(
              r.dateFrom
            )} → ${fmtDate(r.dateTo)} · ${fmtDays(r.days)} días</div>`
          : ""
      }
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="cancel-form">
        <div class="field">
          <label>Motivo (opcional)</label>
          <textarea name="decisionNote" placeholder="Explica el motivo de la cancelación…"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Volver</button>
          <button type="submit" class="btn btn-danger" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Cancelando…" : "Confirmar cancelación"
    }</button>
        </div>
      </form>
    `;
  }

  function renderConfirmOverAllowanceModal(extra) {
    const years = extra.shortfalls || [extra];
    return `<h2 class="modal-title">La solicitud supera el saldo disponible</h2>
      ${years.map(y => `<p>Ejercicio ${esc(y.year)}: exceso de ${fmtDays(y.excess)} días.</p>`).join('')}
      <p>Esta confirmación queda registrada. La solicitud requiere aprobación de otra persona autorizada.</p>
      <div class="modal-actions"><button class="btn btn-outline" data-action="close-modal">Revisar solicitud</button>
      <button class="btn btn-primary" data-action="confirm-over-allowance">Enviar de todos modos</button></div>`;
  }

  function renderChangePasswordModal() {
    return `
      <div class="modal-title">Cambiar contraseña</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="change-password-form">
        ${passwordFieldHtml({ label: "Contraseña actual", name: "currentPassword", autocomplete: "current-password" })}
        ${passwordFieldHtml({ label: "Nueva contraseña", name: "newPassword", autocomplete: "new-password", minlength: 8 })}
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Guardando…" : "Guardar"
    }</button>
        </div>
      </form>
    `;
  }
  return {renderModal, renderRejectModal, renderCancelModal, renderConfirmOverAllowanceModal, renderChangePasswordModal};
}
