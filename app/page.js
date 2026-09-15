"use client";

import { useEffect, useRef } from "react";
import {
  computeDays,
  daysInMonth,
  formatISODate,
  MONTH_NAMES_ES,
  WEEKDAY_NAMES_ES,
} from "@/lib/dateUtils";

const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};
const STATUS_BADGE_CLASS = {
  pending: "badge-pending",
  approved: "badge-approved",
  rejected: "badge-rejected",
  cancelled: "badge-cancelled",
};

function esc(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wordmarkHtml(size, onDark) {
  return `<span class="wordmark ${onDark ? "on-dark" : ""}" style="font-size:${size}"><span class="wm-navy">electr</span><span class="wm-ring"></span><span class="wm-lime">polis</span></span>`;
}

function eyeIconSvg(crossedOut) {
  if (crossedOut) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.79 21.79 0 0 1-3.22 4.6M1 1l22 22M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function passwordFieldHtml({ label, name, autocomplete, minlength, value }) {
  return `
    <div class="field">
      <label>${esc(label)}</label>
      <div class="password-field">
        <input type="password" name="${esc(name)}" ${
    autocomplete ? `autocomplete="${esc(autocomplete)}"` : ""
  } ${minlength ? `minlength="${minlength}"` : ""} value="${esc(value || "")}" required />
        <button type="button" class="password-toggle-btn" data-action="toggle-password-visibility" aria-label="Mostrar contraseña" title="Mostrar contraseña">${eyeIconSvg(
          false
        )}</button>
      </div>
    </div>
  `;
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (err) {
    return String(value);
  }
}

function fmtDays(n) {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function initials(name) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function roleLabel(role) {
  return (
    { worker: "Trabajador", manager: "Encargado de departamento", admin: "Superusuario" }[role] ||
    role
  );
}

function currentYear() {
  return new Date().getFullYear();
}

function computeAllowance(user, requests, year, defaultAllowance) {
  const allowance =
    user.allowanceOverride != null ? Number(user.allowanceOverride) : Number(defaultAllowance);
  const yearStr = String(year);
  const own = requests.filter(
    (r) => r.userId === user.id && r.type === "vacaciones" && r.dateFrom.slice(0, 4) === yearStr
  );
  const consumed = own
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + Number(r.days), 0);
  const pending = own
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + Number(r.days), 0);
  const remaining = Math.max(0, allowance - consumed);
  return { allowance, consumed, pending, remaining };
}

export default function Page() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    return initApp(containerRef.current);
  }, []);

  return <div id="app-container" ref={containerRef} />;
}

function initApp(root) {
  const APP = {
    me: null,
    authChecked: false,
    view: "login",
    loginError: "",
    loginLoading: false,
    config: null,
    departments: [],
    absenceTypes: [],
    holidays: [],
    requests: [],
    users: [],
    birthdays: [],
    loading: true,
    route: "perfil",
    profileTab: "solicitar",
    approvalsTab: "pendientes",
    adminTab: "empleados",
    mobileMenuOpen: false,
    calendar: { year: new Date().getFullYear(), month: new Date().getMonth() },
    calendarDeptFilter: null,
    requestFormValues: {
      type: "vacaciones",
      dateFrom: "",
      dateTo: "",
      halfStart: false,
      halfEnd: false,
      note: "",
    },
    requestFormError: "",
    requestFormLoading: false,
    pendingRequestPayload: null,
    modal: null,
    modalError: "",
    modalLoading: false,
    actionLoadingId: null,
    banner: null,
  };

  let pollTimer = null;
  let bannerTimer = null;

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);

  init();

  return function cleanup() {
    stopPolling();
    if (bannerTimer) clearTimeout(bannerTimer);
    root.removeEventListener("click", onClick);
    root.removeEventListener("submit", onSubmit);
  };

  // ---------------- arranque ----------------

  async function init() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      APP.authChecked = true;
      if (data.user) {
        APP.me = data.user;
        APP.view = "app";
        await loadBootstrap();
        startPolling();
      } else {
        APP.view = "login";
        render();
      }
    } catch (err) {
      APP.authChecked = true;
      APP.view = "login";
      render();
    }
  }

  async function loadBootstrap(silent) {
    if (!silent) {
      APP.loading = true;
      render();
    }
    try {
      const res = await fetch("/api/bootstrap");
      if (res.status === 401) {
        stopPolling();
        APP.me = null;
        APP.view = "login";
        APP.loading = false;
        render();
        return;
      }
      const data = await res.json();
      APP.me = data.me;
      APP.config = data.config;
      APP.departments = data.departments;
      APP.absenceTypes = data.absenceTypes;
      APP.holidays = data.holidays;
      APP.requests = data.requests;
      APP.users = data.users;
      APP.birthdays = data.birthdays || [];
      APP.loading = false;
      if (silent && APP.modal) {
        // No se reconstruye la interfaz mientras hay un formulario modal
        // abierto: los datos ya están al día y se pintarán en el próximo render().
        return;
      }
      render();
    } catch (err) {
      APP.loading = false;
      render();
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      loadBootstrap(true);
    }, 20000);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showBanner(type, text) {
    APP.banner = { type, text };
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      APP.banner = null;
      render();
    }, 4000);
  }

  // ---------------- render ----------------

  function render() {
    root.innerHTML = buildHTML();
    runPostRenderHooks();
  }

  function runPostRenderHooks() {
    const reqForm = root.querySelector('form[data-action="request-form"]');
    if (reqForm) attachRequestFormLivePreview(reqForm);
  }

  function attachRequestFormLivePreview(formEl) {
    const update = () => {
      const fd = new FormData(formEl);
      APP.requestFormValues = {
        type: fd.get("type") || "vacaciones",
        dateFrom: fd.get("dateFrom") || "",
        dateTo: fd.get("dateTo") || "",
        halfStart: fd.get("halfStart") === "on",
        halfEnd: fd.get("halfEnd") === "on",
        note: fd.get("note") || "",
      };
      let days = 0;
      const { dateFrom, dateTo, halfStart, halfEnd } = APP.requestFormValues;
      if (dateFrom && dateTo && dateTo >= dateFrom) {
        const holidaysSet = new Set(APP.holidays.map((h) => h.date));
        days = computeDays(dateFrom, dateTo, halfStart, halfEnd, holidaysSet);
      }
      const out = formEl.querySelector('[data-role="days-preview"]');
      if (out) out.textContent = fmtDays(days);
    };
    formEl.addEventListener("input", update);
    formEl.addEventListener("change", update);
    update();
  }

  function buildHTML() {
    if (!APP.authChecked) return renderSplash();
    if (APP.view === "login") return renderLogin();
    if (!APP.me || APP.loading) return renderSplash();
    return renderShell();
  }

  function renderSplash() {
    return `<div class="login-screen"><div class="spinner-wrap" style="color:#eef3ec">Cargando…</div></div>`;
  }

  function renderLogin() {
    return `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-brand">
            ${wordmarkHtml("32px", false)}
            <p>Gestión de vacaciones y ausencias del equipo</p>
          </div>
          ${APP.loginError ? `<div class="form-error">${esc(APP.loginError)}</div>` : ""}
          <form data-action="login-form">
            <div class="field">
              <label>Usuario</label>
              <input type="text" name="username" autocomplete="username" required />
            </div>
            ${passwordFieldHtml({ label: "Contraseña", name: "password", autocomplete: "current-password" })}
            <button type="submit" class="btn btn-primary btn-block" ${
              APP.loginLoading ? "disabled" : ""
            }>${APP.loginLoading ? "Entrando…" : "Entrar"}</button>
          </form>
          <div class="login-help">
            Si es tu primer acceso, pide tu usuario y contraseña al administrador.<br/>
            El superusuario accede con el usuario <b>admin</b>.
          </div>
        </div>
      </div>
    `;
  }

  function renderShell() {
    return `
      <div class="app-shell">
        ${renderSidebar()}
        <div class="main-area">
          ${renderTopbar()}
          <div class="content">
            ${APP.banner ? renderBanner() : ""}
            ${renderContent()}
          </div>
        </div>
      </div>
      ${APP.mobileMenuOpen ? renderMobileNav() : ""}
      ${APP.modal ? renderModal() : ""}
    `;
  }

  function renderBanner() {
    const cls = APP.banner.type === "error" ? "form-error" : "form-success";
    return `<div class="${cls}">${esc(APP.banner.text)}</div>`;
  }

  function navItemsHtml() {
    const pendingCount = getApprovableRequests("pending").length;
    let html = "";
    html += navBtn("perfil", "Mi perfil");
    html += navBtn("calendario", "Calendario de empresa");
    if (APP.me.role === "manager" || APP.me.role === "admin") {
      html += navBtn("aprobaciones", "Aprobaciones", pendingCount);
    }
    if (APP.me.role === "admin") {
      html += navBtn("administracion", "Administración");
    }
    return html;
  }

  function navBtn(route, label, badge) {
    const active = APP.route === route ? "active" : "";
    return `<button type="button" class="nav-item ${active}" data-action="nav" data-route="${route}">
      <span>${esc(label)}</span>
      ${badge ? `<span class="nav-badge">${badge}</span>` : ""}
    </button>`;
  }

  function sidebarFootHtml() {
    return `
      <div class="sidebar-foot">
        <div class="sidebar-user">
          <div class="avatar">${esc(initials(APP.me.name))}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${esc(APP.me.name)}</div>
            <div class="sidebar-user-role">${roleLabel(APP.me.role)}</div>
          </div>
        </div>
        <button type="button" class="btn-ghost-light" data-action="open-change-password">Cambiar contraseña</button>
        <button type="button" class="btn-ghost-light" data-action="logout">Cerrar sesión</button>
      </div>
    `;
  }

  function renderSidebar() {
    return `
      <aside class="sidebar">
        <div class="brand">
          ${wordmarkHtml("19px", true)}
          <div class="brand-text">Vacaciones</div>
        </div>
        <nav class="nav-list">${navItemsHtml()}</nav>
        ${sidebarFootHtml()}
      </aside>
    `;
  }

  function renderTopbar() {
    return `
      <div class="topbar">
        <div class="brand">${wordmarkHtml("16px", true)}</div>
        <button type="button" class="hamburger-btn" data-action="toggle-mobile-menu">☰</button>
      </div>
    `;
  }

  function renderMobileNav() {
    return `
      <div class="mobile-nav-overlay">
        <div class="flex-between" style="margin-bottom:24px">
          <div class="brand">${wordmarkHtml("18px", true)}</div>
          <button type="button" class="hamburger-btn" data-action="toggle-mobile-menu">✕</button>
        </div>
        <nav class="nav-list">${navItemsHtml()}</nav>
        ${sidebarFootHtml()}
      </div>
    `;
  }

  function renderContent() {
    switch (APP.route) {
      case "perfil":
        return renderProfileView();
      case "calendario":
        return renderCalendarView();
      case "aprobaciones":
        return APP.me.role === "manager" || APP.me.role === "admin"
          ? renderApprovalsView()
          : renderProfileView();
      case "administracion":
        return APP.me.role === "admin" ? renderAdminView() : renderProfileView();
      default:
        return renderProfileView();
    }
  }

  // ---------------- Perfil ----------------

  function renderProfileView() {
    return `
      <div class="page-header"><h1>Mi perfil</h1><p>Solicita ausencias y consulta tu disponibilidad de vacaciones.</p></div>
      <div class="tabs">
        ${profileTabBtn("solicitar", "Solicitar")}
        ${profileTabBtn("mis-solicitudes", "Mis solicitudes")}
        ${profileTabBtn("disponibilidad", "Disponibilidad")}
      </div>
      ${APP.profileTab === "solicitar" ? renderRequestForm() : ""}
      ${APP.profileTab === "mis-solicitudes" ? renderMyRequests() : ""}
      ${APP.profileTab === "disponibilidad" ? renderAvailability() : ""}
    `;
  }

  function profileTabBtn(tab, label) {
    return `<button type="button" class="tab-btn ${
      APP.profileTab === tab ? "active" : ""
    }" data-action="profile-tab" data-tab="${tab}">${esc(label)}</button>`;
  }

  function renderRequestForm() {
    if (!APP.me.department) {
      return `<div class="card"><div class="empty-state">Tu usuario no tiene un departamento asignado, así que no puedes solicitar ausencias. Contacta con el administrador.</div></div>`;
    }
    const f = APP.requestFormValues;
    const typeOptions = APP.absenceTypes
      .map((t) => `<option value="${t.id}" ${f.type === t.id ? "selected" : ""}>${esc(t.name)}</option>`)
      .join("");

    return `
      <div class="card" style="max-width:560px">
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
    `;
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
      </tr>
    `
      )
      .join("");

    return `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tipo</th><th>Fechas</th><th>Días</th><th>Estado</th><th>Solicitada</th><th>Motivo resolución</th></tr></thead>
            <tbody>${
              rows || `<tr class="empty-row"><td colspan="6">Todavía no has enviado ninguna solicitud</td></tr>`
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

  // ---------------- Calendario ----------------

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
    const todayISO = formatISODate(new Date());

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
            return `<div class="cal-chip" style="background:${color}" title="${esc(r.userName)} · ${esc(
              typeName(r.type)
            )} · ${esc(deptName)}">${esc(r.userName)}</div>`;
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
    `;
  }

  // ---------------- Aprobaciones ----------------

  function getApprovableRequests(status) {
    if (!APP.me) return [];
    return APP.requests.filter(
      (r) =>
        r.status === status &&
        (APP.me.role === "admin" ||
          (APP.me.role === "manager" && APP.me.department === r.department && APP.me.id !== r.userId))
    );
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

  // ---------------- Administración ----------------

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
      </div>
      ${APP.adminTab === "empleados" ? renderAdminEmployees() : ""}
      ${APP.adminTab === "festivos" ? renderAdminHolidays() : ""}
      ${APP.adminTab === "solicitudes" ? renderAdminAllRequests() : ""}
      ${APP.adminTab === "informes" ? renderAdminReports() : ""}
    `;
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
          <button type="button" class="btn btn-primary btn-sm" data-action="open-add-worker-modal">+ Añadir trabajador</button>
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
    const list = APP.requests.slice(0, 200);
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
        <div class="section-title">Últimas ${list.length} solicitudes</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Trabajador</th><th>Departamento</th><th>Tipo</th><th>Fechas</th><th>Días</th><th>Estado</th><th>Solicitada</th></tr></thead>
            <tbody>${rows || `<tr class="empty-row"><td colspan="7">No hay solicitudes</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function computeTypeWorkerCounts() {
    const year = currentYear();
    const yearStr = String(year);
    const activeIds = new Set(APP.users.filter((u) => u.active).map((u) => u.id));
    const byType = APP.absenceTypes.map((t) => {
      const workerIds = new Set(
        APP.requests
          .filter(
            (r) =>
              r.type === t.id &&
              r.status === "approved" &&
              r.dateFrom.slice(0, 4) === yearStr &&
              activeIds.has(r.userId)
          )
          .map((r) => r.userId)
      );
      return { type: t, count: workerIds.size };
    });
    return { year, totalActive: activeIds.size, byType };
  }

  function computeDepartmentTypeCounts() {
    const year = currentYear();
    const yearStr = String(year);
    return APP.departments.map((d) => {
      const deptUsers = APP.users.filter((u) => u.active && u.department === d.id);
      const deptUserIds = new Set(deptUsers.map((u) => u.id));
      const byType = APP.absenceTypes.map((t) => {
        const workerIds = new Set(
          APP.requests
            .filter(
              (r) =>
                r.type === t.id &&
                r.status === "approved" &&
                r.dateFrom.slice(0, 4) === yearStr &&
                deptUserIds.has(r.userId)
            )
            .map((r) => r.userId)
        );
        return { type: t, count: workerIds.size };
      });
      const total = byType.reduce((s, x) => s + x.count, 0);
      return { dept: d, employeeCount: deptUsers.length, byType, total };
    });
  }

  function reportBarRow(label, pct, valueText, color) {
    return `
      <div class="report-bar-row">
        <div class="report-bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="report-bar-track"><div class="report-bar-fill" style="width:${Math.min(
          100,
          Math.max(0, pct)
        )}%;background:${color}"></div></div>
        <div class="report-bar-value mono">${esc(valueText)}</div>
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
    return `
      <div class="report-bar-row">
        <div class="report-bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="report-bar-track"><div class="stacked-bar-fill" style="width:${totalWidthPct}%">${segmentsHtml}</div></div>
        <div class="report-bar-value mono">${total} trabajador${total === 1 ? "" : "es"}</div>
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
          t.type.color
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
          d.byType.map((t) => ({ label: t.type.name, count: t.count, color: t.type.color })),
          maxDeptTotal
        )
      )
      .join("");

    return `
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
      <div class="faint">El listado de días de vacaciones restantes por trabajador se mantiene en la pestaña "Empleados".</div>
    `;
  }

  // ---------------- Modales ----------------

  function renderModal() {
    const m = APP.modal;
    if (!m) return "";
    let inner = "";
    let wide = false;
    if (m.type === "reject") inner = renderRejectModal();
    else if (m.type === "cancel") inner = renderCancelModal();
    else if (m.type === "confirmOverAllowance") inner = renderConfirmOverAllowanceModal(m.extra);
    else if (m.type === "addWorker") inner = renderWorkerFormModal(null);
    else if (m.type === "editWorker") inner = renderWorkerFormModal(APP.users.find((u) => u.id === m.userId));
    else if (m.type === "resetPassword") inner = renderResetPasswordModal();
    else if (m.type === "addHoliday") inner = renderAddHolidayModal();
    else if (m.type === "changePassword") inner = renderChangePasswordModal();
    else if (m.type === "importHolidays") {
      inner = renderImportHolidaysModal();
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
    return `
      <div class="modal-title">Vas a superar tu saldo disponible</div>
      <div class="modal-sub">Tienes ${fmtDays(
        Math.max(0, extra.allowance - extra.used)
      )} días disponibles y esta solicitud es de ${fmtDays(
      extra.days
    )} días. Puedes enviarla igualmente: quedará pendiente de aprobación por tu encargado.</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">Revisar solicitud</button>
        <button type="button" class="btn btn-primary" data-action="confirm-over-allowance">Enviar de todos modos</button>
      </div>
    `;
  }

  function renderChangePasswordModal() {
    return `
      <div class="modal-title">Cambiar contraseña</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="change-password-form">
        ${passwordFieldHtml({ label: "Contraseña actual", name: "currentPassword", autocomplete: "current-password" })}
        ${passwordFieldHtml({ label: "Nueva contraseña", name: "newPassword", autocomplete: "new-password", minlength: 6 })}
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
          <input type="email" name="email" value="${isEdit ? esc(user.email || "") : ""}" />
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
          ${passwordFieldHtml({ label: "Contraseña inicial", name: "password", autocomplete: "new-password", minlength: 6 })}
        `
            : ""
        }
        <div class="field">
          <label>Fecha de nacimiento</label>
          <input type="date" name="birthDate" value="${
            isEdit && user.birthDate ? esc(user.birthDate) : ""
          }" ${isEdit ? "" : "required"} />
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

  function renderResetPasswordModal() {
    const user = APP.users.find((u) => u.id === APP.modal.userId);
    return `
      <div class="modal-title">Restablecer contraseña</div>
      <div class="modal-sub">${user ? `${esc(user.name)} (${esc(user.username)})` : ""}</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <form data-action="reset-password-form" data-user-id="${APP.modal.userId}">
        ${passwordFieldHtml({ label: "Nueva contraseña", name: "newPassword", autocomplete: "new-password", minlength: 6 })}
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary" ${APP.modalLoading ? "disabled" : ""}>${
      APP.modalLoading ? "Guardando…" : "Restablecer"
    }</button>
        </div>
      </form>
    `;
  }

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
          <button type="button" class="btn btn-primary" data-action="confirm-import-holidays" ${
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

  // ---------------- helpers dependientes de APP ----------------

  function deptPillHtml(deptId) {
    const dept = APP.departments.find((d) => d.id === deptId);
    if (!dept) return `<span class="dept-pill">${esc(deptId || "—")}</span>`;
    return `<span class="dept-pill" style="background:${dept.color}22;color:${dept.color};border-color:${dept.color}55"><span class="dept-dot" style="background:${dept.color}"></span>${esc(
      dept.name
    )}</span>`;
  }

  function typeName(typeId) {
    const t = APP.absenceTypes.find((x) => x.id === typeId);
    return t ? t.name : typeId;
  }

  // ---------------- eventos ----------------

  function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "FORM") return;
    const action = el.dataset.action;
    switch (action) {
      case "nav":
        APP.route = el.dataset.route;
        APP.mobileMenuOpen = false;
        render();
        break;
      case "toggle-mobile-menu":
        APP.mobileMenuOpen = !APP.mobileMenuOpen;
        render();
        break;
      case "logout":
        handleLogout();
        break;
      case "open-change-password":
        APP.modal = { type: "changePassword" };
        APP.modalError = "";
        APP.mobileMenuOpen = false;
        render();
        break;
      case "profile-tab":
        APP.profileTab = el.dataset.tab;
        render();
        break;
      case "approvals-tab":
        APP.approvalsTab = el.dataset.tab;
        render();
        break;
      case "admin-tab":
        APP.adminTab = el.dataset.tab;
        render();
        break;
      case "cal-prev-month":
        shiftCalendarMonth(-1);
        break;
      case "cal-next-month":
        shiftCalendarMonth(1);
        break;
      case "toggle-dept-filter":
        toggleDeptFilter(el.dataset.dept);
        break;
      case "approve-request":
        handleApprove(el.dataset.id);
        break;
      case "open-reject-modal":
        APP.modal = { type: "reject", requestId: el.dataset.id };
        APP.modalError = "";
        render();
        break;
      case "open-cancel-modal":
        APP.modal = { type: "cancel", requestId: el.dataset.id };
        APP.modalError = "";
        render();
        break;
      case "open-add-worker-modal":
        APP.modal = { type: "addWorker" };
        APP.modalError = "";
        render();
        break;
      case "open-edit-worker-modal":
        APP.modal = { type: "editWorker", userId: el.dataset.id };
        APP.modalError = "";
        render();
        break;
      case "open-reset-password-modal":
        APP.modal = { type: "resetPassword", userId: el.dataset.id };
        APP.modalError = "";
        render();
        break;
      case "open-add-holiday-modal":
        APP.modal = { type: "addHoliday" };
        APP.modalError = "";
        render();
        break;
      case "delete-holiday":
        handleDeleteHoliday(el.dataset.date);
        break;
      case "close-modal":
        APP.modal = null;
        render();
        break;
      case "confirm-over-allowance":
        submitRequestPayload(APP.pendingRequestPayload);
        break;
      case "toggle-password-visibility": {
        const wrapper = el.closest(".password-field");
        const input = wrapper?.querySelector("input");
        if (input) {
          const willShow = input.type === "password";
          input.type = willShow ? "text" : "password";
          el.innerHTML = eyeIconSvg(willShow);
          el.setAttribute("aria-label", willShow ? "Ocultar contraseña" : "Mostrar contraseña");
          el.title = willShow ? "Ocultar contraseña" : "Mostrar contraseña";
        }
        break;
      }
      case "open-import-holidays-modal":
        APP.modal = { type: "importHolidays", step: "upload" };
        APP.modalError = "";
        render();
        break;
      case "confirm-import-holidays":
        handleConfirmImportHolidays();
        break;
      case "toggle-import-row": {
        const idx = Number(el.dataset.index);
        if (APP.modal && APP.modal.selected) {
          if (el.checked) APP.modal.selected.add(idx);
          else APP.modal.selected.delete(idx);
          const btn = root.querySelector('[data-action="confirm-import-holidays"]');
          if (btn) btn.textContent = `Importar (${APP.modal.selected.size})`;
        }
        break;
      }
      default:
        break;
    }
  }

  function onSubmit(e) {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const action = form.dataset.action;
    if (!action) return;
    e.preventDefault();
    const fd = new FormData(form);

    switch (action) {
      case "import-holidays-form":
        return handleImportHolidaysUpload(fd);
      case "login-form":
        return handleLogin(fd);
      case "request-form":
        return handleRequestSubmit(fd);
      case "change-password-form":
        return handleChangePassword(fd);
      case "add-worker-form":
        return handleAddWorker(fd);
      case "edit-worker-form":
        return handleEditWorker(fd, form);
      case "reset-password-form":
        return handleResetPassword(fd, form);
      case "add-holiday-form":
        return handleAddHoliday(fd);
      case "reject-form":
        return handleResolveWithNote("reject", fd);
      case "cancel-form":
        return handleResolveWithNote("cancel", fd);
      default:
        return undefined;
    }
  }

  // ---------------- acciones ----------------

  async function handleLogin(fd) {
    APP.loginLoading = true;
    APP.loginError = "";
    render();
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) {
        APP.loginError = data.error || "No se ha podido iniciar sesión";
        APP.loginLoading = false;
        render();
        return;
      }
      APP.loginLoading = false;
      APP.view = "app";
      await loadBootstrap();
      startPolling();
    } catch (err) {
      APP.loginError = "Error de conexión";
      APP.loginLoading = false;
      render();
    }
  }

  async function handleLogout() {
    stopPolling();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      // ignorar errores de red al cerrar sesión
    }
    APP.me = null;
    APP.view = "login";
    APP.route = "perfil";
    APP.loginError = "";
    render();
  }

  async function handleRequestSubmit(fd) {
    const type = fd.get("type");
    const dateFrom = fd.get("dateFrom");
    const dateTo = fd.get("dateTo");
    const halfStart = fd.get("halfStart") === "on";
    const halfEnd = fd.get("halfEnd") === "on";
    const note = (fd.get("note") || "").toString().trim();

    APP.requestFormError = "";

    if (!dateFrom || !dateTo || dateTo < dateFrom) {
      APP.requestFormError = "Revisa el rango de fechas";
      render();
      return;
    }

    const holidaysSet = new Set(APP.holidays.map((h) => h.date));
    const days = computeDays(dateFrom, dateTo, halfStart, halfEnd, holidaysSet);
    if (days <= 0) {
      APP.requestFormError = "El rango elegido no contiene días laborables";
      render();
      return;
    }

    const payload = { type, dateFrom, dateTo, halfStart, halfEnd, note };

    if (type === "vacaciones") {
      const info = computeAllowance(APP.me, APP.requests, currentYear(), APP.config.defaultAllowance);
      if (info.consumed + info.pending + days > info.allowance) {
        APP.pendingRequestPayload = payload;
        APP.modal = {
          type: "confirmOverAllowance",
          extra: { days, allowance: info.allowance, used: info.consumed + info.pending },
        };
        render();
        return;
      }
    }

    await submitRequestPayload(payload);
  }

  async function submitRequestPayload(payload) {
    APP.requestFormLoading = true;
    APP.modal = null;
    render();
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      APP.requestFormLoading = false;
      if (!res.ok) {
        APP.requestFormError = data.error || "No se ha podido enviar la solicitud";
        render();
        return;
      }
      APP.requestFormError = "";
      APP.requestFormValues = {
        type: "vacaciones",
        dateFrom: "",
        dateTo: "",
        halfStart: false,
        halfEnd: false,
        note: "",
      };
      APP.profileTab = "mis-solicitudes";
      showBanner("success", "Solicitud enviada correctamente");
      await loadBootstrap(true);
    } catch (err) {
      APP.requestFormLoading = false;
      APP.requestFormError = "Error de conexión";
      render();
    }
  }

  async function handleApprove(id) {
    APP.actionLoadingId = id;
    render();
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      APP.actionLoadingId = null;
      if (!res.ok) {
        showBanner("error", data.error || "No se ha podido aprobar la solicitud");
        render();
        return;
      }
      showBanner("success", "Solicitud aprobada");
      await loadBootstrap(true);
    } catch (err) {
      APP.actionLoadingId = null;
      showBanner("error", "Error de conexión");
      render();
    }
  }

  async function handleResolveWithNote(action, fd) {
    const id = APP.modal && APP.modal.requestId;
    const decisionNote = (fd.get("decisionNote") || "").toString().trim() || null;
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, decisionNote }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido completar la acción";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", action === "reject" ? "Solicitud rechazada" : "Solicitud cancelada");
      await loadBootstrap(true);
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleChangePassword(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: fd.get("currentPassword"),
          newPassword: fd.get("newPassword"),
        }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido cambiar la contraseña";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", "Contraseña actualizada");
      render();
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleAddWorker(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email") || null,
          username: fd.get("username"),
          password: fd.get("password"),
          department: fd.get("department") || null,
          role: fd.get("role"),
          allowanceOverride: fd.get("allowanceOverride") || null,
          birthDate: fd.get("birthDate") || null,
        }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido crear el trabajador";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", "Trabajador creado");
      await loadBootstrap(true);
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleEditWorker(fd, form) {
    const userId = form.dataset.userId;
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email") || "",
          department: fd.get("department") || null,
          role: fd.get("role"),
          allowanceOverride: fd.get("allowanceOverride") || null,
          active: fd.get("active") === "on",
          birthDate: fd.get("birthDate") || null,
        }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido guardar";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", "Trabajador actualizado");
      await loadBootstrap(true);
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleResetPassword(fd, form) {
    const userId = form.dataset.userId;
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: fd.get("newPassword") }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido restablecer la contraseña";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", "Contraseña restablecida");
      render();
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleAddHoliday(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: fd.get("date"), name: fd.get("name") }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido añadir el festivo";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", "Festivo añadido");
      await loadBootstrap(true);
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleDeleteHoliday(date) {
    try {
      const res = await fetch(`/api/holidays/${encodeURIComponent(date)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showBanner("error", data.error || "No se ha podido borrar el festivo");
        render();
        return;
      }
      showBanner("success", "Festivo eliminado");
      await loadBootstrap(true);
    } catch (err) {
      showBanner("error", "Error de conexión");
      render();
    }
  }

  async function handleImportHolidaysUpload(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch("/api/holidays/import", { method: "POST", body: fd });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido analizar el archivo";
        render();
        return;
      }
      APP.modal = {
        type: "importHolidays",
        step: "review",
        parsedHolidays: data.holidays,
        selected: new Set(data.holidays.map((_, i) => i)),
      };
      render();
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleConfirmImportHolidays() {
    const m = APP.modal;
    if (!m || !m.parsedHolidays) return;
    const selected = m.parsedHolidays.filter((_, i) => m.selected.has(i));
    if (!selected.length) {
      APP.modalError = "Selecciona al menos un festivo";
      render();
      return;
    }
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch("/api/holidays/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holidays: selected }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido importar";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", `${data.imported} festivo(s) importado(s)`);
      await loadBootstrap(true);
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }
}
