import { apiFetch } from './api.js';
import { esc, passwordFieldHtml, roleLabel } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  function renderEditProfileModal() {
    const me = APP.me;
    return `
      <div class="modal-title">Perfil de usuario</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="edit-profile-form">
        <div class="field">
          <label>Nombre</label>
          <input type="text" name="name" value="${esc(me.name)}" required />
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${esc(me.email || "")}" required />
        </div>
        <div class="field">
          <label>Fecha de nacimiento</label>
          <input type="date" name="birthDate" value="${me.birthDate ? esc(me.birthDate) : ""}" />
          <label><input type="checkbox" name="shareBirthday" ${me.shareBirthday ? "checked" : ""}>Compartir solo el día y mes de mi cumpleaños en el calendario</label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Guardando…" : "Guardar"
    }</button>
        </div>
      </form>
    `;
  }

  function renderWorkerFormModal(user) {
    const isEdit = !!user;
    const deptOptions =
      `<option value="">— Sin departamento —</option>` +
      APP.departments
        .map(
          (d) =>
            `<option value="${d.id}" ${user && user.department === d.id ? "selected" : ""}>${esc(
              d.name
            )}</option>`
        )
        .join("");
    const roleOptions = ["worker", "manager", "admin"]
      .map((r) => `<option value="${r}" ${user && user.role === r ? "selected" : ""}>${roleLabel(r)}</option>`)
      .join("");

    return `
      <div class="modal-title">${isEdit ? "Editar trabajador" : "Nuevo trabajador"}</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="${isEdit ? "edit-worker-form" : "add-worker-form"}" data-user-id="${
      isEdit ? user.id : ""
    }">
        <div class="field">
          <label>Nombre</label>
          <input type="text" name="name" value="${isEdit ? esc(user.name) : ""}" required />
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${isEdit ? esc(user.email || "") : ""}" required />
        </div>
        ${
          !isEdit
            ? `
          <div class="field-row">
            <div class="field">
              <label>Usuario</label>
              <input type="text" name="username" required />
            </div>
          </div>
          ${passwordFieldHtml({ label: "Contraseña inicial", name: "password", autocomplete: "new-password", minlength: 12 })}
        `
            : ""
        }
        <div class="field">
          <label>Fecha de nacimiento</label>
          <input type="date" name="birthDate" value="${
            isEdit && user.birthDate ? esc(user.birthDate) : ""
          }"  />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Departamento</label>
            <select name="department">${deptOptions}</select>
          </div>
          <div class="field">
            <label>Rol</label>
            <select name="role">${roleOptions}</select>
          </div>
        </div>
        <div class="field">
          <label>Días de vacaciones / año (vacío = usar el valor por defecto)</label>
          <input type="number" step="0.5" min="0" name="allowanceOverride" value="${
            isEdit && user.allowanceOverride != null ? user.allowanceOverride : ""
          }" />
        </div>
        ${
          isEdit
            ? `<label class="checkbox-row"><input type="checkbox" name="active" ${
                user.active ? "checked" : ""
              }/> Trabajador activo</label>`
            : ""
        }
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Guardando…" : "Guardar"
    }</button>
        </div>
      </form>
    `;
  }

  function renderInviteWorkersModal() {
    const m = APP.modal;
    if (m.step === "result") {
      const rows = [
        ...m.results.created.map(
          (r) => `
          <div class="invite-result-row">
            <span class="badge badge-approved">Invitado</span>
            <span class="wrap">${esc(r.name)} — ${esc(r.email)} (usuario: ${esc(r.username)})${
            r.mailQueued ? " · aviso pendiente de envío" : r.mailSent ? " · aviso enviado" : " · aviso no enviado"
          }</span>
          </div>`
        ),
        ...m.results.skipped.map(
          (email) => `
          <div class="invite-result-row">
            <span class="badge badge-cancelled">Ya existía</span>
            <span class="wrap">${esc(email)}</span>
          </div>`
        ),
        ...m.results.failed.map(
          (f) => `
          <div class="invite-result-row">
            <span class="badge badge-rejected">Error</span>
            <span class="wrap">${esc(f.line)} — ${esc(f.error)}</span>
          </div>`
        ),
      ].join("");

      return `
        <div class="modal-title">Resultado de las invitaciones</div>
        <div class="modal-sub">${m.results.created.length} cuenta(s) creada(s). Consulta el estado de sus avisos en la bandeja de salida.</div>
        <div class="import-review-list">${rows || `<div class="invite-result-row">Sin resultados</div>`}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" data-action="close-modal">Cerrar</button>
        </div>
      `;
    }

    const deptOptions =
      `<option value="">— Sin departamento —</option>` +
      APP.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
    const roleOptions = ["worker", "manager", "admin"]
      .map((r) => `<option value="${r}" ${r === "worker" ? "selected" : ""}>${roleLabel(r)}</option>`)
      .join("");

    return `
      <div class="modal-title">Invitar trabajadores por correo</div>
      <div class="modal-sub">Pega una lista de correos (uno por línea). Opcionalmente puedes indicar el nombre antes del correo separado por una coma: "Nombre Apellido, correo@empresa.com". Se creará cada cuenta y se preparará un aviso de bienvenida sin contraseña. Establece después su contraseña inicial desde la administración y comunícala por el canal interno acordado. El primer acceso exigirá cambiarla.</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="invite-workers-form">
        <div class="field">
          <label>Correos</label>
          <textarea name="emails" rows="8" placeholder="Ana Torres, ana@empresa.com&#10;diego@empresa.com" required></textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Departamento</label>
            <select name="department">${deptOptions}</select>
          </div>
          <div class="field">
            <label>Rol</label>
            <select name="role">${roleOptions}</select>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Enviando…" : "Enviar invitaciones"
    }</button>
        </div>
      </form>
    `;
  }

  function renderResetPasswordModal() {
    const user = APP.users.find((u) => u.id === APP.modal.userId);
    return `
      <div class="modal-title">Restablecer contraseña</div>
      <div class="modal-sub">${user ? `${esc(user.name)} (${esc(user.username)})` : ""}</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="reset-password-form" data-user-id="${APP.modal.userId}">
        ${passwordFieldHtml({ label: "Nueva contraseña", name: "newPassword", autocomplete: "new-password", minlength: 12 })}
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Guardando…" : "Restablecer"
    }</button>
        </div>
      </form>
    `;
  }

  function renderDeleteWorkerModal() {
    const user = APP.users.find(u => u.id === APP.modal.userId);
    return `<h2 class="modal-title">Desactivar trabajador</h2>
      <p>Se cerrarán las sesiones de ${esc(user?.name || 'este trabajador')}. Su historial y justificantes se conservarán.</p>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ''}
      <div class="modal-actions"><button class="btn btn-outline" data-action="close-modal">Cancelar</button>
      <button class="btn btn-danger" data-action="confirm-delete-worker" ${APP.modalLoading ? 'disabled' : ''}>Desactivar</button></div>`;
  }
  return {renderEditProfileModal, renderWorkerFormModal, renderInviteWorkersModal, renderResetPasswordModal, renderDeleteWorkerModal};
}
