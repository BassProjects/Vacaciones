import { apiFetch } from './api.js';
import { avatarHtml, esc, fmtDate } from './shared.js';
import { WEEKDAY_NAMES_ES } from './dates.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {computeOverlapping, renderAttachmentsBody, typeName} = ctx.calls;
  function renderAddHolidayModal() {
    return `
      <div class="modal-title">Nuevo festivo</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="add-holiday-form">
        <div class="field">
          <label>Fecha</label>
          <input type="date" name="date" required />
        </div>
        <div class="field">
          <label>Nombre</label>
          <input type="text" name="name" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Guardando…" : "Añadir festivo"
    }</button>
        </div>
      </form>
    `;
  }

  function renderImportHolidaysModal() {
    const m = APP.modal;
    if (m.step === "review") {
      const list = m.parsedHolidays
        .map(
          (h, i) => `
        <label class="import-row">
          <input type="checkbox" data-action="toggle-import-row" data-index="${i}" ${
            m.selected.has(i) ? "checked" : ""
          } />
          <span class="mono">${fmtDate(h.date)}</span>
          <span class="wrap">${esc(h.name)}</span>
        </label>
      `
        )
        .join("");

      return `
        <div class="modal-title">Revisa los festivos encontrados</div>
        <div class="modal-sub">${m.parsedHolidays.length} festivo(s) detectados en el archivo. Desmarca los que no quieras importar.</div>
        ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
        <div class="import-review-list">${list}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="button" class="btn btn-primary import-confirm-btn" data-action="confirm-import-holidays" ${
            APP.modalLoading ? "disabled" : ""
          }>${APP.modalLoading ? "Importando…" : `Importar (${m.selected.size})`}</button>
        </div>
      `;
    }

    return `
      <div class="modal-title">Importar festivos</div>
      <div class="modal-sub">Sube un Excel (.xlsx/.xls), CSV o PDF con una columna de fecha y otra de nombre (en un PDF, líneas de texto con la fecha y el nombre). Podrás revisar el resultado antes de guardarlo.</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="import-holidays-form">
        <div class="field">
          <label>Archivo</label>
          <input type="file" name="file" accept=".xlsx,.xls,.csv,.pdf" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Analizando…" : "Analizar archivo"
    }</button>
        </div>
      </form>
    `;
  }

  function renderImportCalamariModal() {
    const m = APP.modal;
    if (m.step === "review") {
      const list = m.periods
        .map((p, i) => {
          const matched = Boolean(p.matchedUserId);
          const who = p.matchedUserName || p.name || p.email;
          return `
        <label class="import-row-calamari${matched ? "" : " import-row-disabled"}">
          <input type="checkbox" data-action="toggle-import-row" data-index="${i}" ${
            m.selected.has(i) ? "checked" : ""
          } ${matched ? "" : "disabled"} />
          <span>
            <div><b>${esc(who)}</b> · ${esc(typeName(p.type))}</div>
            <div class="faint mono">${fmtDate(p.dateFrom)}${
            p.dateFrom !== p.dateTo ? ` → ${fmtDate(p.dateTo)}` : ""
          } · ${p.days} día(s)${matched ? "" : " · sin usuario con ese correo (" + esc(p.email) + ")"}</div>
          </span>
        </label>
      `;
        })
        .join("");

      return `
        <div class="modal-title">Revisa el histórico encontrado</div>
        <div class="modal-sub">${m.periods.length} ausencia(s) detectadas en el archivo. Solo se pueden importar las de trabajadores con correo coincidente. Se guardarán como aprobadas.</div>
        ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
        <div class="import-review-list">${list}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="button" class="btn btn-primary import-confirm-btn" data-action="confirm-import-calamari" ${
            APP.modalLoading ? "disabled" : ""
          }>${APP.modalLoading ? "Importando…" : `Importar (${m.selected.size})`}</button>
        </div>
      `;
    }

    return `
      <div class="modal-title">Importar histórico de Calamari</div>
      <div class="modal-sub">Sube una exportación "Detailed timesheet" de Calamari (.xlsx). Se emparejará cada fila con un trabajador existente por correo electrónico. Podrás revisar el resultado antes de guardarlo.</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="import-calamari-form">
        <div class="field">
          <label>Archivo</label>
          <input type="file" name="file" accept=".xlsx,.xls" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Analizando…" : "Analizar archivo"
    }</button>
        </div>
      </form>
    `;
  }

  function renderAttachmentsModal(m) {
    const request = APP.requests.find((r) => r.id === m.requestId);
    if (!request) {
      return `<div class="modal-title">Solicitud no encontrada</div>`;
    }
    return `
      <div class="modal-title">Justificante de baja</div>
      <div class="modal-sub">${esc(typeName(request.type))} · ${fmtDate(request.dateFrom)} – ${fmtDate(
      request.dateTo
    )}</div>
      ${renderAttachmentsBody(request, m)}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">Cerrar</button>
      </div>
    `;
  }

  function overlapDayHeaderParts(iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    const idx = (d.getUTCDay() + 6) % 7;
    const weekdayShort = WEEKDAY_NAMES_ES[idx].slice(0, 2).toUpperCase();
    const dayNum = String(d.getUTCDate()).padStart(2, "0");
    const monthNum = String(d.getUTCMonth() + 1).padStart(2, "0");
    return { weekdayShort, dayNum, monthNum };
  }

  function renderOverlapModal(m) {
    const request = APP.requests.find((r) => r.id === m.requestId);
    if (!request) return `<div class="modal-title">Solicitud no encontrada</div>`;
    const overlap = computeOverlapping(request);
    const byDay = m.scope === "dept" ? overlap.byDayDept : overlap.byDayAll;
    const deptName = APP.departments.find((d) => d.id === request.department)?.name || request.department;
    const title = m.scope === "dept" ? `${deptName} / Todo el equipo` : "Toda la organización";
    const max = Math.max(1, ...byDay.map((d) => d.users.length));

    const tabsHtml = byDay
      .map((d, i) => {
        const { weekdayShort, dayNum } = overlapDayHeaderParts(d.date);
        const pct = Math.max(8, Math.round((d.users.length / max) * 100));
        return `
          <a class="overlap-day-tab${i === 0 ? " active" : ""}" href="#overlap-day-${esc(d.date)}">
            <div class="overlap-day-tab-bar"><div class="overlap-day-tab-bar-fill" style="height:${pct}%"></div></div>
            <div class="overlap-day-tab-label">${esc(weekdayShort)}<br/>${esc(dayNum)}</div>
          </a>
        `;
      })
      .join("");

    const bodyHtml = byDay
      .map((d) => {
        const { weekdayShort, dayNum, monthNum } = overlapDayHeaderParts(d.date);
        const rows = d.users.length
          ? d.users
              .map(
                (u) => `
            <div class="overlap-person-row">
              <div class="overlap-person-left">${avatarHtml(u, 26)}<span>${esc(u.name)}</span></div>
              <span class="overlap-person-range mono">${fmtDate(u.dateFrom)} - ${fmtDate(u.dateTo)}</span>
            </div>
          `
              )
              .join("")
          : `<div class="empty-state">Nadie ausente este día.</div>`;
        return `
          <div class="overlap-day-group" id="overlap-day-${esc(d.date)}">
            <div class="overlap-day-header">
              <span class="overlap-day-date">${esc(weekdayShort)} ${dayNum}.${monthNum}</span>
              ${d.users.length ? `<span class="overlap-day-count-badge">${d.users.length}</span>` : ""}
            </div>
            ${rows}
          </div>
        `;
      })
      .join("");

    return `
      <div class="overlap-modal-header">
        <div class="modal-title">${esc(title)}</div>
        <button type="button" class="modal-close-x" data-action="close-modal" aria-label="Cerrar">✕</button>
      </div>
      <div class="overlap-day-tabs">${tabsHtml}</div>
      <div class="overlap-modal-body">${bodyHtml}</div>
    `;
  }
  return {renderAddHolidayModal, renderImportHolidaysModal, renderImportCalamariModal, renderAttachmentsModal, overlapDayHeaderParts, renderOverlapModal};
}
