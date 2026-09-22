import { apiFetch } from './api.js';
import { avatarHtml, esc, fmtDate, todayISO as todayInMadrid } from './shared.js';
import { MONTH_NAMES_ES, WEEKDAY_NAMES_ES, daysInMonth, formatISODate } from './dates.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {loadBootstrap, render, typeName} = ctx.calls;
  function shiftCalendarMonth(delta) {
    let { year, month } = APP.calendar;
    month += delta;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    if (month > 11) {
      month = 0;
      year += 1;
    }
    APP.calendar = { year, month };
    render();
    loadBootstrap(true);
  }

  function shiftRequestCalMonth(delta) {
    let { year, month } = APP.requestCalMonth;
    month += delta;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    if (month > 11) {
      month = 0;
      year += 1;
    }
    APP.requestCalMonth = { year, month };
    render();
    loadBootstrap(true);
  }

  function toggleDeptFilter(deptId) {
    if (!APP.calendarDeptFilter) {
      APP.calendarDeptFilter = new Set(APP.departments.map((d) => d.id));
    }
    if (APP.calendarDeptFilter.has(deptId)) {
      APP.calendarDeptFilter.delete(deptId);
    } else {
      APP.calendarDeptFilter.add(deptId);
    }
    render();
  }

  function renderCalendarView() {
    if (!APP.calendarDeptFilter) {
      APP.calendarDeptFilter = new Set(APP.departments.map((d) => d.id));
    }
    const { year, month } = APP.calendar;
    const holidaysMap = new Map(APP.holidays.map((h) => [h.date, h.name]));
    const todayISO = todayInMadrid();

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
        const dayBirthdays = (APP.birthdays || []).filter(
          (b) => b.month === c.date.getUTCMonth() + 1 && b.day === c.date.getUTCDate()
        );

        const classes = ["cal-day"];
        if (c.outside) classes.push("outside");
        if (isWeekend) classes.push("weekend");
        if (holidayName) classes.push("holiday");
        if (dayBirthdays.length) classes.push("has-birthday");
        if (iso === todayISO) classes.push("today");

        const dayRequests = APP.requests.filter(
          (r) =>
            r.status === "approved" &&
            r.dateFrom <= iso &&
            r.dateTo >= iso &&
            APP.calendarDeptFilter.has(r.department)
        );
        const visible = dayRequests.slice(0, 3);
        const extra = dayRequests.length - visible.length;
        const chips = visible
          .map((r) => {
            const type = APP.absenceTypes.find((t) => t.id === r.type);
            const color = type ? type.color : "#888";
            const deptName = APP.departments.find((d) => d.id === r.department)?.name || r.department;
            const rosterUser = APP.roster.find((u) => u.id === r.userId);
            return `
              <div class="cal-chip-wrap" data-action="open-request-detail" data-id="${esc(r.id)}">
                <div class="cal-chip" style="background:${color}">${esc(r.userName)}</div>
                <div class="cal-chip-popover">
                  ${avatarHtml(rosterUser || { name: r.userName }, 48)}
                  <div class="popover-name">${esc(r.userName)}</div>
                  <div class="popover-type">${esc(typeName(r.type))} · ${esc(deptName)}</div>
                  <div class="popover-dates">${fmtDate(r.dateFrom).slice(0, 5)} – ${fmtDate(
              r.dateTo
            ).slice(0, 5)}</div>
                  <div class="popover-status">Aprobado</div>
                </div>
              </div>
            `;
          })
          .join("");

        const birthdayChips = dayBirthdays
          .map(
            (b) => `
              <div class="cal-birthday-chip" title="Cumpleaños de ${esc(b.name)}">
                <div class="cal-birthday-label">🎂 CUMPLEAÑOS</div>
                <div class="cal-birthday-name">${esc(b.name)}</div>
              </div>
            `
          )
          .join("");

        return `
          <div class="${classes.join(" ")}">
            <div class="cal-day-num">${c.date.getUTCDate()}</div>
            ${
              holidayName
                ? `<div class="cal-day-holiday-name" title="${esc(holidayName)}">${esc(holidayName)}</div>`
                : ""
            }
            ${birthdayChips}
            ${chips}
            ${extra > 0 ? `<div class="cal-more">+${extra} más</div>` : ""}
          </div>
        `;
      })
      .join("");

    const weekdaysHtml = WEEKDAY_NAMES_ES.map((w) => `<div class="cal-weekday">${w}</div>`).join("");

    const deptChips = APP.departments
      .map(
        (d) => `
      <span class="dept-pill dept-filter-chip ${APP.calendarDeptFilter.has(d.id) ? "active" : ""}"
        data-action="toggle-dept-filter" data-dept="${d.id}"
        style="background:${d.color}22;color:${d.color};border-color:${d.color}">
        <span class="dept-dot" style="background:${d.color}"></span>${esc(d.name)}
      </span>
    `
      )
      .join("");

    const typeLegend = APP.absenceTypes
      .map(
        (t) =>
          `<span class="type-legend-item"><span class="dept-dot" style="background:${t.color}"></span>${esc(
            t.name
          )}</span>`
      )
      .join("");

    return `
      <div class="page-header"><h1>Calendario de empresa</h1><p>Ausencias aprobadas de todos los departamentos, coloreadas según el motivo. Usa los filtros para elegir qué departamentos ver.</p></div>
      <div class="calendar-layout">
        <div class="calendar-main">
          <div class="cal-toolbar">
            <div class="cal-nav">
              <button type="button" class="icon-btn" data-action="cal-prev-month">‹</button>
              <div class="cal-title">${MONTH_NAMES_ES[month]} ${year}</div>
              <button type="button" class="icon-btn" data-action="cal-next-month">›</button>
            </div>
            <div class="dept-filters">${deptChips}</div>
          </div>
          <div class="type-legend">${typeLegend}</div>
          <div class="card">
            <div class="cal-grid">
              ${weekdaysHtml}
              ${dayCellsHtml}
            </div>
          </div>
        </div>
        <div class="calendar-side">${renderRosterPanel()}</div>
      </div>
    `;
  }

  function renderRosterPanel() {
    const todayISO = todayInMadrid();
    const onVacationTodayIds = new Set(
      APP.requests
        .filter(
          (r) =>
            r.type === "vacaciones" &&
            r.status === "approved" &&
            r.dateFrom <= todayISO &&
            r.dateTo >= todayISO
        )
        .map((r) => r.userId)
    );

    function rosterGroupHtml(title, color, members) {
      if (!members.length) return "";
      const items = members
        .map((u) => {
          const away = onVacationTodayIds.has(u.id);
          return `
            <div class="roster-item ${away ? "roster-item-away" : ""}">
              ${avatarHtml(u, 26)}
              <div class="roster-item-text">
                <div class="roster-name">${esc(u.name)}${
            u.role === "manager" ? ` <span class="roster-tag">· Jefe/a</span>` : ""
          }</div>
                ${away ? `<div class="roster-away-badge">🌴 De vacaciones hoy</div>` : ""}
              </div>
            </div>
          `;
        })
        .join("");
      return `
        <div class="roster-group">
          <div class="roster-group-title"><span class="dept-dot" style="background:${color}"></span>${esc(
        title
      )}</div>
          ${items}
        </div>
      `;
    }

    const deptGroups = APP.departments
      .map((d) => rosterGroupHtml(d.name, d.color, APP.roster.filter((u) => u.department === d.id)))
      .join("");
    const noDeptGroup = rosterGroupHtml(
      "Administración",
      "#8b9a8c",
      APP.roster.filter((u) => !u.department)
    );

    return `
      <div class="card roster-card">
        <div class="section-title">Plantilla</div>
        <div class="faint" style="margin-bottom:12px">Se remarcan quienes están de vacaciones hoy.</div>
        ${deptGroups}${noDeptGroup || ""}
        ${!APP.roster.length ? `<div class="empty-state">No hay empleados activos.</div>` : ""}
      </div>
    `;
  }
  return {shiftCalendarMonth, shiftRequestCalMonth, toggleDeptFilter, renderCalendarView, renderRosterPanel};
}
