import { apiFetch } from './api.js';
import { esc } from './shared.js';

const labels = {deactivate: 'Desactivar', activate: 'Reactivar', remove: 'Eliminar', resend: 'Enviar enlace de registro'};

export function workerActionsHtml(user, me) {
  const button = (operation, label, danger = false) => `<button type="button" class="btn ${danger ? 'btn-danger' : 'btn-outline'} btn-sm" data-action="manage-worker" data-operation="${operation}" data-id="${esc(user.id)}">${label}</button>`;
  let html = `<button type="button" class="btn btn-outline btn-sm" data-action="open-edit-worker-modal" data-id="${esc(user.id)}">Editar</button>`;
  if (user.onboardingPending) {
    if (user.active) html += button('resend', labels.resend);
  } else {
    html += `<button type="button" class="btn btn-outline btn-sm" data-action="open-reset-password-modal" data-id="${esc(user.id)}">Contraseña</button>`;
  }
  if (user.id !== me.id) {
    html += button(user.active ? 'deactivate' : 'activate', user.active ? 'Desactivar' : 'Reactivar');
    html += button('remove', 'Eliminar', true);
  }
  return html;
}

export function workerManagementModal(APP) {
  const modal = APP.modal;
  const user = APP.users.find(row => row.id === modal.userId);
  if (!user || !labels[modal.operation]) return '<p>Trabajador no disponible. Recarga la lista.</p>';
  const description = {
    deactivate: 'Se cerrarán sus sesiones y se invalidarán sus enlaces de registro. Su historial y justificantes se conservarán.',
    activate: user.onboardingPending ? 'Se habilitará la cuenta. Después deberás enviarle un enlace para que complete su registro; los enlaces antiguos seguirán invalidados.' : 'Podrá volver a iniciar sesión con su contraseña. Su historial no cambia.',
    remove: 'La cuenta desaparecerá de Empleados y perderá el acceso. Sus solicitudes, saldos, justificantes y auditoría se conservarán para no perder el historial de la empresa. La eliminación requiere confirmación.',
    resend: 'Se enviará un enlace personal de registro a su correo. Los enlaces anteriores dejarán de servir. El correo se procesará en la siguiente pasada del servicio.',
  };
  return `<h2 class="modal-title">${labels[modal.operation]} trabajador</h2>
    <p><strong>${esc(user.name)}</strong> (${esc(user.username)})</p>
    <p>${description[modal.operation]}</p>
    ${APP.modalError ? `<p class="form-error" role="alert">${esc(APP.modalError)}</p>` : ''}
    <form data-action="manage-worker-form">
      ${modal.operation === 'remove' ? `<div class="field"><label for="confirm-worker-delete">Escribe ${esc(user.username)} para confirmar</label><input id="confirm-worker-delete" name="confirmation" autocomplete="off" maxlength="80" required></div>` : ''}
      <div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal" ${APP.modalLoading ? 'disabled' : ''}>Cancelar</button>
        <button type="submit" class="btn ${modal.operation === 'remove' ? 'btn-danger' : 'btn-primary'}" ${APP.modalLoading ? 'disabled' : ''}>${APP.modalLoading ? 'Procesando…' : labels[modal.operation]}</button></div>
    </form>`;
}

export async function manageWorker(ctx, fields) {
  const {APP} = ctx;
  const {render, loadBootstrap, showBanner} = ctx.calls;
  const modal = APP.modal;
  if (APP.modalLoading || modal?.type !== 'manageWorker') return;
  const user = APP.users.find(row => row.id === modal.userId);
  const operation = modal.operation;
  if (!user || !labels[operation]) return;
  if (operation === 'remove' && fields.get('confirmation') !== user.username) {
    APP.modalError = 'Escribe el usuario exacto para confirmar la eliminación.'; render(); return;
  }
  APP.modalLoading = true; APP.modalError = ''; render();
  try {
    let path = `/api/users/${encodeURIComponent(user.id)}`;
    const options = {headers: {'Content-Type': 'application/json'}};
    if (operation === 'remove') {
      path += '/remove'; options.method = 'POST';
      options.body = JSON.stringify({confirmation: fields.get('confirmation')});
    } else if (operation === 'resend') {
      path += '/activation-link'; options.method = 'POST';
      options.headers['Idempotency-Key'] = modal.requestKey;
    } else {
      options.method = 'PATCH'; options.body = JSON.stringify({active: operation === 'activate'});
    }
    const response = await apiFetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se ha podido completar la operación.');
    if (APP.modal !== modal) return;
    APP.modal = null;
    const notices = {remove: 'Trabajador eliminado. Se conserva la auditoría.',
      deactivate: 'Trabajador desactivado. Se conserva su historial.',
      activate: 'Trabajador reactivado.', resend: 'Enlace de registro preparado para envío por correo.'};
    showBanner('success', notices[operation]);
    await loadBootstrap(true);
  } catch (failure) {
    if (APP.modal === modal) APP.modalError = failure.message || 'No se ha podido confirmar la operación.';
  } finally {
    APP.modalLoading = false; render();
  }
}
