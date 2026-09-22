import { apiFetch } from './api.js';
import { STATUS_BADGE_CLASS, STATUS_LABELS, computeAllowance, currentYear, esc, fmtDate, fmtDateTime, fmtDays, paperclipIconSvg, todayISO as todayInMadrid } from './shared.js';
import { MONTH_NAMES_ES, WEEKDAY_NAMES_ES, daysInMonth, formatISODate } from './dates.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {typeName} = ctx.calls;
  function renderRequestForm() {
    if (!APP.me.department) {
      return `<div class="card"><div class="empty-state">Tu usuario no tiene un departamento asignado, así que no puedes solicitar ausencias. Contacta con el administrador.</div></div>`;
    }
    const f = APP.requestFormValues;
    const typeOptions = APP.absenceTypes
      .map((t) => `<option value="${t.id}" ${f.type === t.id ? "selected" : ""}>${esc(t.name)}</option>`)
      .join("");

    return `
      <div class="request-layout">
        <div class="request-cal-col">${renderRequestCalendar()}</div>
        <div class="request-form-col">
          <div class="card">
            ${APP.requestFormError ? `<div class="form-error">${esc(APP.requestFormError)}</div>` : ""}
            <form data-action="request-form">
              <div class="field">
                <label>Tipo de ausencia</label>
                <select name="type">${typeOptions}</select>
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Desde</label>
                  <input type="date" name="dateFrom" value="${esc(f.dateFrom)}" required />
                </div>
                <div class="field">
                  <label>Hasta</label>
                  <input type="date" name="dateTo" value="${esc(f.dateTo)}" required />
                </div>
              </div>
              <div class="field-row">
                <label class="checkbox-row"><input type="checkbox" name="halfStart" ${
                  f.halfStart ? "checked" : ""
                } /> Medio día al inicio</label>
                <label class="checkbox-row"><input type="checkbox" name="halfEnd" ${
                  f.halfEnd ? "checked" : ""
                } /> Medio día al final</label>
              </div>
              <div class="preview-box">
                <span class="muted">Días solicitados</span>
                <span class="big mono" data-role="days-preview">0</span>
              </div>
              <div class="field">
                <label>Nota (opcional)</label>
                <textarea name="note" placeholder="Información adicional para tu encargado…">${esc(
                  f.note
                )}</textarea>
              </div>
              <button type="submit" class="btn btn-primary btn-block" ${
                APP.requestFormLoading ? "disabled" : ""
              }>${APP.requestFormLoading ? "Enviando…" : "Enviar solicitud"}</button>
            </form>
          </div>
        </div>
      </div>
      <div class="request-allowance-wrap" data-role="allowance-bars">${renderAllowanceBars(f)}</div>
    `;
  }

  function renderRequestCalendar() {
    const { year, month } = APP.requestCalMonth;
    const holidaysMap = new Map(APP.holidays.map((h) => [h.date, h.name]));
    const todayISO = todayInMadrid();
    const f = APP.requestFormValues;

    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7;
    const totalDays = daysInMonth(year, month);
    const lastOfMonth = new Date(Date.UTC(year, month, totalDays));
    const lastWeekday = (lastOfMonth.getUTCDay() + 6) % 7;
    const trailing = 6 - lastWeekday;

    const cells = [];
    for (let i = firstWeekday; i > 0; i--) {
      cells.push({ date: new Date(Date.UTC(year, month, 1 - i)), outside: true });
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push({ date: new Date(Date.UTC(year, month, d)), outside: false });
    }
    for (let i = 1; i <= trailing; i++) {
      cells.push({ date: new Date(Date.UTC(year, month, totalDays + i)), outside: true });
    }

    const dayCellsHtml = cells
      .map((c) => {
        const iso = formatISODate(c.date);
        const dow = c.date.getUTCDay();
        const isWeekend = dow === 0 || dow === 6;
        const holidayName = holidaysMap.get(iso);
        const inRange = !!f.dateFrom && !!f.dateTo && iso >= f.dateFrom && iso <= f.dateTo;

        const classes = ["reqcal-day"];
        if (c.outside) classes.push("outside");
        if (isWeekend) classes.push("weekend");
        if (holidayName) classes.push("holiday");
        if (iso === todayISO) classes.push("today");
        if (inRange) classes.push("selected");
        if (iso === f.dateFrom) classes.push("range-start");
        if (iso === f.dateTo) classes.push("range-end");

        return `
          <div class="${classes.join(" ")}" data-date="${iso}" title="${esc(holidayName || "")}">
            <span class="reqcal-day-num">${c.date.getUTCDate()}</span>
          </div>
        `;
      })
      .join("");

    const weekdaysHtml = WEEKDAY_NAMES_ES.map((w) => `<div class="reqcal-weekday">${w}</div>`).join("");

    return `
      <div class="cal-toolbar">
        <div class="cal-nav">
          <button type="button" class="icon-btn" data-action="reqcal-prev-month">‹</button>
          <div class="cal-title">${MONTH_NAMES_ES[month]} ${year}</div>
          <button type="button" class="icon-btn" data-action="reqcal-next-month">›</button>
        </div>
        <button type="button" class="btn btn-outline btn-sm" data-action="reqcal-today">Hoy</button>
      </div>
      <div class="card">
        <div class="reqcal-grid" data-role="reqcal-grid">
          ${weekdaysHtml}
          ${dayCellsHtml}
        </div>
      </div>
    `;
  }

  function renderAllowanceBars(form) {
    if (form.type !== 'vacaciones') return '';
    const preview = APP.preview;
    if (!preview) return '<p class="faint">El servidor comprobará el saldo y los días laborables.</p>';
    return Object.entries(preview.balances || {}).map(([year,b]) => `<p><strong>${esc(year)}</strong> ·
      ${fmtDays(b.remaining)} días disponibles · ${fmtDays(b.pending)} pendientes de aprobación</p>`).join('');
  }

  function renderMyRequests() {
    const mine = APP.requests
      .filter((r) => r.userId === APP.me.id)
      .slice()
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    const rows = mine
      .map(
        (r) => `
      <tr>
        <td>${esc(typeName(r.type))}</td>
        <td class="mono">${fmtDate(r.dateFrom)} → ${fmtDate(r.dateTo)}</td>
        <td class="mono">${fmtDays(r.days)}</td>
        <td><span class="badge ${STATUS_BADGE_CLASS[r.status]}">${STATUS_LABELS[r.status]}</span></td>
        <td class="mono">${fmtDateTime(r.requestedAt)}</td>
        <td class="wrap">${r.decisionNote ? esc(r.decisionNote) : '<span class="faint">—</span>'}</td>
        <td>${
          r.type === "baja"
            ? `<button type="button" class="btn btn-outline btn-sm" data-action="open-attachments-modal" data-id="${esc(
                r.id
              )}">${paperclipIconSvg()} Justificante</button>`
            : '<span class="faint">—</span>'
        }</td>
      </tr>
    `
      )
      .join("");

    return `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tipo</th><th>Fechas</th><th>Días</th><th>Estado</th><th>Solicitada</th><th>Motivo resolución</th><th>Justificante</th></tr></thead>
            <tbody>${
              rows || `<tr class="empty-row"><td colspan="7">Todavía no has enviado ninguna solicitud</td></tr>`
            }</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAvailability() {
    const year = currentYear();
    const info = computeAllowance(APP.me, APP.requests, year, APP.config.defaultAllowance);
    const pct =
      info.allowance > 0 ? Math.min(100, Math.round((info.consumed / info.allowance) * 100)) : 0;

    const approvedThisYear = APP.requests.filter(
      (r) => r.userId === APP.me.id && r.status === "approved" && r.dateFrom.slice(0, 4) === String(year)
    );
    const byType = {};
    approvedThisYear.forEach((r) => {
      byType[r.type] = (byType[r.type] || 0) + Number(r.days);
    });
    const breakdownRows = APP.absenceTypes
      .map((t) => `<tr><td>${esc(t.name)}</td><td class="mono">${fmtDays(byType[t.id] || 0)}</td></tr>`)
      .join("");

    return `
      <div class="grid grid-3">
        <div class="card stat-card">
          <div class="label">Vacaciones ${year}</div>
          <div class="value">${fmtDays(info.allowance)}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Consumidas</div>
          <div class="value">${fmtDays(info.consumed)}</div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="card stat-card">
          <div class="label">Disponibles</div>
          <div class="value accent">${fmtDays(info.remaining)}</div>
        </div>
      </div>
      <div class="card">
        <div class="flex-between">
          <div class="label muted">Pendientes de aprobar</div>
          <div class="value mono" style="font-size:18px">${fmtDays(info.pending)} días</div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Desglose por tipo de ausencia (${year})</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tipo</th><th>Días aprobados</th></tr></thead>
            <tbody>${breakdownRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }
  return {renderRequestForm, renderRequestCalendar, renderAllowanceBars, renderMyRequests, renderAvailability};
}
