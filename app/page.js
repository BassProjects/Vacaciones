"use client";

import { useEffect, useRef } from "react";
import {
  computeDays,
  daysInMonth,
  enumerateWorkDays,
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

const GLOBAL_AWAY_LIMIT_PCT = 30;

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
  const src = onDark ? "/brand-logo-dark.png" : "/brand-logo-light.png";
  return `<img class="wordmark-logo" src="${src}" alt="SepiaMary" style="height:${size}" />`;
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

const AVATAR_COLORS = [
  "#772222",
  "#773e22",
  "#4d7722",
  "#227722",
  "#22774d",
  "#226277",
  "#224577",
  "#452277",
  "#772262",
  "#77223e",
];

function avatarColor(name) {
  const key = (name || "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function avatarHtml(user, size) {
  const px = size || 34;
  const fontPx = Math.round(px * 0.4);
  const name = user && user.name;
  const img = user && user.avatarUrl
    ? `<img class="avatar-img" src="${esc(user.avatarUrl)}" alt="" onerror="this.remove()" />`
    : "";
  return `<span class="avatar" style="width:${px}px;height:${px}px;font-size:${fontPx}px;background:${avatarColor(
    name
  )};color:#fff">${img}${esc(initials(name))}</span>`;
}

function fmtBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function infoIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12" y2="8"/></svg>`;
}

function paperclipIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
}

function historyIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3" y2="6"/><line x1="3" y1="12" x2="3" y2="12"/><line x1="3" y1="18" x2="3" y2="18"/></svg>`;
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

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
    roster: [],
    loading: true,
    route: "perfil",
    profileTab: "solicitar",
    approvalsTab: "pendientes",
    adminTab: "empleados",
    mobileMenuOpen: false,
    userMenuOpen: false,
    calendar: { year: new Date().getFullYear(), month: new Date().getMonth() },
    calendarDeptFilter: null,
    requestCalMonth: { year: new Date().getFullYear(), month: new Date().getMonth() },
    reqCalDragging: false,
    reqCalDragAnchor: null,
    requestFormValues: {
      type: "vacaciones",
      dateFrom: formatISODate(new Date()),
      dateTo: formatISODate(new Date()),
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
    detailPanel: null,
  };

  let pollTimer = null;
  let bannerTimer = null;
  const HOVER_POPOVER_SELECTOR = ".cal-chip-wrap, .report-value-wrap";

  function onDocumentMouseUp() {
    APP.reqCalDragging = false;
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("mouseover", onHoverPopoverEnter);
  root.addEventListener("mouseout", onHoverPopoverLeave);
  document.addEventListener("mouseup", onDocumentMouseUp);

  init();

  return function cleanup() {
    stopPolling();
    if (bannerTimer) clearTimeout(bannerTimer);
    root.removeEventListener("click", onClick);
    root.removeEventListener("submit", onSubmit);
    root.removeEventListener("mouseover", onHoverPopoverEnter);
    root.removeEventListener("mouseout", onHoverPopoverLeave);
    document.removeEventListener("mouseup", onDocumentMouseUp);
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
      APP.roster = data.roster || [];
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
    if (reqForm) {
      attachRequestFormLivePreview(reqForm);
      attachRequestCalendarDrag(reqForm);
    }
  }

  function syncReqCalSelection(dateFrom, dateTo) {
    const grid = root.querySelector('[data-role="reqcal-grid"]');
    if (!grid) return;
    grid.querySelectorAll(".reqcal-day[data-date]").forEach((cell) => {
      const d = cell.dataset.date;
      const inRange = !!dateFrom && !!dateTo && d >= dateFrom && d <= dateTo;
      cell.classList.toggle("selected", inRange);
      cell.classList.toggle("range-start", d === dateFrom);
      cell.classList.toggle("range-end", d === dateTo);
    });
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

      const barsEl = root.querySelector('[data-role="allowance-bars"]');
      if (barsEl) barsEl.innerHTML = renderAllowanceBars(APP.requestFormValues);

      if (!APP.reqCalDragging && dateFrom) {
        const anchor = new Date(`${dateFrom}T00:00:00Z`);
        const wantedYear = anchor.getUTCFullYear();
        const wantedMonth = anchor.getUTCMonth();
        if (wantedYear !== APP.requestCalMonth.year || wantedMonth !== APP.requestCalMonth.month) {
          APP.requestCalMonth = { year: wantedYear, month: wantedMonth };
          render();
          return;
        }
      }
      syncReqCalSelection(dateFrom, dateTo);
    };
    formEl.addEventListener("input", update);
    formEl.addEventListener("change", update);
    update();
  }

  function attachRequestCalendarDrag(formEl) {
    const grid = root.querySelector('[data-role="reqcal-grid"]');
    if (!grid) return;
    const dateFromInput = formEl.querySelector('input[name="dateFrom"]');
    const dateToInput = formEl.querySelector('input[name="dateTo"]');
    if (!dateFromInput || !dateToInput) return;

    function setRange(fromISO, toISO) {
      dateFromInput.value = fromISO;
      dateToInput.value = toISO;
      dateFromInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    grid.addEventListener("mousedown", (e) => {
      const cell = e.target.closest(".reqcal-day[data-date]");
      if (!cell) return;
      e.preventDefault();
      APP.reqCalDragging = true;
      APP.reqCalDragAnchor = cell.dataset.date;
      setRange(APP.reqCalDragAnchor, APP.reqCalDragAnchor);
    });

    grid.addEventListener("mouseover", (e) => {
      if (!APP.reqCalDragging) return;
      const cell = e.target.closest(".reqcal-day[data-date]");
      if (!cell) return;
      const hovered = cell.dataset.date;
      const anchor = APP.reqCalDragAnchor;
      setRange(hovered < anchor ? hovered : anchor, hovered < anchor ? anchor : hovered);
    });
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
            ${wordmarkHtml("104px", false)}
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
      ${APP.detailPanel ? renderDetailPanel() : ""}
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
        <div class="user-menu-wrap${APP.userMenuOpen ? " open" : ""}">
          <button type="button" class="sidebar-user" data-action="toggle-user-menu">
            ${avatarHtml(APP.me, 34)}
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${esc(APP.me.name)}</div>
              <div class="sidebar-user-role">${roleLabel(APP.me.role)}</div>
            </div>
          </button>
          <div class="user-menu-dropdown">
            <div class="user-menu-header">
              ${avatarHtml(APP.me, 40)}
              <div class="user-menu-headinfo">
                <div class="user-menu-name">${esc(APP.me.name)}</div>
                ${APP.me.email ? `<div class="user-menu-email">${esc(APP.me.email)}</div>` : ""}
              </div>
            </div>
            <button type="button" class="user-menu-item" data-action="open-user-profile">Perfil de usuario</button>
            <button type="button" class="user-menu-item" data-action="open-change-password">Cambiar contraseña</button>
            <button type="button" class="user-menu-item" data-action="logout">Cerrar sesión</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSidebar() {
    return `
      <aside class="sidebar">
        <div class="brand brand-stacked">
          ${wordmarkHtml("72px", true)}
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
        <div class="brand">${wordmarkHtml("40px", true)}</div>
        <button type="button" class="hamburger-btn" data-action="toggle-mobile-menu">☰</button>
      </div>
    `;
  }

  function renderMobileNav() {
    return `
      <div class="mobile-nav-overlay">
        <div class="flex-between" style="margin-bottom:24px">
          <div class="brand">${wordmarkHtml("48px", true)}</div>
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
    const todayISO = formatISODate(new Date());
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

  function renderAllowanceBars(f) {
    const type = APP.absenceTypes.find((t) => t.id === f.type);
    if (!type || !type.consumesAllowance) return "";
    if (!f.dateFrom || !f.dateTo || f.dateTo < f.dateFrom) return "";

    const holidaysSet = new Set(APP.holidays.map((h) => h.date));
    const startYear = Number(f.dateFrom.slice(0, 4));
    const endYear = Number(f.dateTo.slice(0, 4));
    const rows = [];

    for (let year = startYear; year <= endYear; year++) {
      const sliceFrom = f.dateFrom.slice(0, 4) === String(year) ? f.dateFrom : `${year}-01-01`;
      const sliceTo = f.dateTo.slice(0, 4) === String(year) ? f.dateTo : `${year}-12-31`;
      if (sliceFrom > sliceTo) continue;
      const sliceHalfStart = sliceFrom === f.dateFrom ? f.halfStart : false;
      const sliceHalfEnd = sliceTo === f.dateTo ? f.halfEnd : false;
      const selectedDays = computeDays(sliceFrom, sliceTo, sliceHalfStart, sliceHalfEnd, holidaysSet);

      const info = computeAllowance(APP.me, APP.requests, year, APP.config.defaultAllowance);
      const total = Math.max(info.allowance, info.consumed + selectedDays);
      const consumedPct = total > 0 ? Math.min(100, (info.consumed / total) * 100) : 0;
      const selectedPct = total > 0 ? Math.min(100 - consumedPct, (selectedDays / total) * 100) : 0;
      const over = info.consumed + selectedDays > info.allowance;

      rows.push(`
        <div class="allowance-bar-row">
          <div class="allowance-bar-track">
            <div class="allowance-bar-fill consumed" style="width:${consumedPct}%"></div>
            <div class="allowance-bar-fill selected${over ? " over" : ""}" style="width:${selectedPct}%"></div>
            <span class="allowance-bar-text">${fmtDays(selectedDays)} día${
        fmtDays(selectedDays) === "1" ? "" : "s"
      } / ${fmtDays(info.allowance)} días</span>
          </div>
          <span class="allowance-bar-year">${year}</span>
        </div>
      `);
    }

    if (!rows.length) return "";
    return `<div class="section-title">Disponibilidad</div>${rows.join("")}`;
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
    const todayISO = formatISODate(new Date());
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
              ${
                u.id !== APP.me.id
                  ? `<button type="button" class="btn btn-danger btn-sm" data-action="open-delete-worker-modal" data-id="${u.id}">Eliminar</button>`
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
    const year = currentYear();
    const yearStr = String(year);
    const activeIds = new Set(APP.users.filter((u) => u.active).map((u) => u.id));
    const byType = APP.absenceTypes.map((t) => {
      const workers = workersForRequests(
        APP.requests.filter(
          (r) =>
            r.type === t.id &&
            r.status === "approved" &&
            r.dateFrom.slice(0, 4) === yearStr &&
            activeIds.has(r.userId)
        )
      );
      return { type: t, count: workers.length, workers };
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
        const workers = workersForRequests(
          APP.requests.filter(
            (r) =>
              r.type === t.id &&
              r.status === "approved" &&
              r.dateFrom.slice(0, 4) === yearStr &&
              deptUserIds.has(r.userId)
          )
        );
        return { type: t, count: workers.length, workers };
      });
      const total = byType.reduce((s, x) => s + x.count, 0);
      return { dept: d, employeeCount: deptUsers.length, byType, total };
    });
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
        ${reportValuePopoverHtml(`${total} trabajador${total === 1 ? "" : "es"}`, label, lines)}
      </div>
    `;
  }

  function computeGlobalAwayGauge() {
    const todayISO = formatISODate(new Date());
    const activeUsers = APP.users.filter((u) => u.active);
    const awayUserIds = new Set(
      APP.requests
        .filter((r) => r.status === "approved" && r.dateFrom <= todayISO && r.dateTo >= todayISO)
        .map((r) => r.userId)
    );
    const awayCount = activeUsers.filter((u) => awayUserIds.has(u.id)).length;
    const total = activeUsers.length;
    const pct = total > 0 ? Math.round((awayCount / total) * 100) : 0;
    return { awayCount, total, pct, overLimit: pct > GLOBAL_AWAY_LIMIT_PCT };
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
        <p class="faint" style="margin:6px 0 14px">Trabajadores de vacaciones, de baja o ausentes por cualquier motivo hoy, sobre el total de la plantilla activa. Límite recomendado: ${GLOBAL_AWAY_LIMIT_PCT}%.</p>
        <div class="gauge-wrap">
          <div class="gauge-track"><div class="gauge-fill ${
            g.overLimit ? "warn" : "ok"
          }" style="width:${Math.min(100, g.pct)}%"></div></div>
          <div class="gauge-marker" style="left:${GLOBAL_AWAY_LIMIT_PCT}%" title="Límite: ${GLOBAL_AWAY_LIMIT_PCT}%"></div>
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
      <div class="faint">El listado de días de vacaciones restantes por trabajador se mantiene en la pestaña "Empleados".</div>
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

  function renderDeleteWorkerModal() {
    const user = APP.users.find((u) => u.id === APP.modal.userId);
    return `
      <div class="modal-title">Eliminar trabajador</div>
      <div class="modal-sub">Esta acción no se puede deshacer. Se eliminará la cuenta y todo el historial de solicitudes de ${
        user ? `<b>${esc(user.name)}</b> (${esc(user.username)})` : "este trabajador"
      }.</div>
      ${APP.modalError ? `<div class="form-error">${esc(APP.modalError)}</div>` : ""}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>
        <button type="button" class="btn btn-danger" data-action="confirm-delete-worker" ${
          APP.modalLoading ? "disabled" : ""
        }>${APP.modalLoading ? "Eliminando…" : "Eliminar definitivamente"}</button>
      </div>
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

  function canUploadAttachment(request) {
    return (
      request.type === "baja" &&
      (APP.me.role === "admin" ||
        (APP.me.role === "manager" && APP.me.department === request.department) ||
        APP.me.id === request.userId)
    );
  }

  function renderAttachmentsBody(request, ctx) {
    const items = ctx.attachments || [];
    const listHtml = items.length
      ? items
          .map(
            (a) => `
        <a class="attachment-row" href="/api/requests/${esc(request.id)}/attachments/${esc(
              a.id
            )}" target="_blank" rel="noopener" data-action="open-attachment-popup" data-url="/api/requests/${esc(
              request.id
            )}/attachments/${esc(a.id)}">
          <span class="attachment-icon">${a.mimeType.startsWith("image/") ? "🖼️" : "📄"}</span>
          <div class="attachment-info">
            <div class="attachment-name">${esc(a.filename)}</div>
            <div class="faint">${fmtBytes(a.sizeBytes)} · ${esc(a.uploadedBy)} · ${fmtDateTime(a.uploadedAt)}</div>
          </div>
        </a>
      `
          )
          .join("")
      : `<div class="empty-state">No se ha adjuntado todavía ningún anexo a la solicitud.</div>`;

    const uploadHtml = canUploadAttachment(request)
      ? `
      <form data-action="upload-attachment-form" data-request-id="${esc(request.id)}" class="attachment-upload-form">
        <input type="file" name="file" accept="image/*,application/pdf" required />
        <button type="submit" class="btn btn-outline btn-sm" ${ctx.uploading ? "disabled" : ""}>${
          ctx.uploading ? "Subiendo…" : "Adjuntar justificante"
        }</button>
      </form>
      ${ctx.attachError ? `<div class="form-error">${esc(ctx.attachError)}</div>` : ""}
    `
      : "";

    return `
      <div class="attachment-list">${
        ctx.attachLoading ? `<div class="empty-state">Cargando…</div>` : listHtml
      }</div>
      ${uploadHtml}
    `;
  }

  function usersOnDay(iso, deptFilter) {
    return APP.requests
      .filter(
        (r) =>
          r.status === "approved" &&
          r.dateFrom <= iso &&
          r.dateTo >= iso &&
          (!deptFilter || r.department === deptFilter)
      )
      .map((r) => {
        const rosterUser = APP.roster.find((u) => u.id === r.userId);
        return {
          id: r.userId,
          name: r.userName,
          department: r.department,
          avatarUrl: rosterUser?.avatarUrl,
          dateFrom: r.dateFrom,
          dateTo: r.dateTo,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function buildOverlapScope(days, deptFilter) {
    const byDay = days.map((iso) => ({ date: iso, users: usersOnDay(iso, deptFilter) }));
    const byId = new Map();
    byDay.forEach((d) => d.users.forEach((u) => byId.set(u.id, u)));
    return { list: [...byId.values()], byDay };
  }

  function computeOverlapping(request) {
    const holidaysSet = new Set(APP.holidays.map((h) => h.date));
    const days = enumerateWorkDays(request.dateFrom, request.dateTo, holidaysSet);
    const deptScope = buildOverlapScope(days, request.department);
    const allScope = buildOverlapScope(days, null);
    return {
      days,
      all: allScope.list,
      sameDept: deptScope.list,
      byDayAll: allScope.byDay,
      byDayDept: deptScope.byDay,
    };
  }

  function renderOverlapAvatars(list) {
    const shown = list.slice(0, 5);
    const extra = list.length - shown.length;
    const avatars = shown.map((u) => avatarHtml(u, 26)).join("");
    const extraHtml = extra > 0 ? `<span class="overlap-extra">+${extra}</span>` : "";
    return `<div class="overlap-avatars">${avatars}${extraHtml}</div>`;
  }

  function renderOverlapSparkline(byDay) {
    const max = Math.max(1, ...byDay.map((d) => d.users.length));
    const bars = byDay
      .map((d) => {
        const pct = Math.max(8, Math.round((d.users.length / max) * 100));
        const cls = d.users.length > 0 ? "overlap-bar-fill" : "overlap-bar-fill empty";
        return `<div class="overlap-bar"><div class="${cls}" style="height:${pct}%"></div></div>`;
      })
      .join("");
    return `<div class="overlap-sparkline">${bars}</div>`;
  }

  function renderOverlapRow(label, list, byDay, requestId, scope) {
    return `
      <div class="overlap-row" data-action="open-overlap-modal" data-id="${esc(requestId)}" data-scope="${esc(
      scope
    )}">
        <div class="overlap-row-label">${esc(label)}</div>
        <div class="overlap-row-right">
          ${renderOverlapSparkline(byDay)}
          ${renderOverlapAvatars(list)}
        </div>
      </div>
    `;
  }

  function renderDetailInfo(request) {
    const type = APP.absenceTypes.find((t) => t.id === request.type);
    const overlap = computeOverlapping(request);
    const rosterApprover = APP.roster.find((u) => u.name === request.resolvedBy);
    const deptName = APP.departments.find((d) => d.id === request.department)?.name || request.department;

    let allowanceHtml = "";
    if (type && type.consumesAllowance) {
      const fullUser = APP.users.find((u) => u.id === request.userId);
      const pseudoUser = {
        id: request.userId,
        allowanceOverride: fullUser ? fullUser.allowanceOverride : null,
      };
      const year = request.dateFrom.slice(0, 4);
      const info = computeAllowance(pseudoUser, APP.requests, year, APP.config.defaultAllowance);
      const pct = info.allowance > 0 ? Math.min(100, Math.round((info.remaining / info.allowance) * 100)) : 0;
      allowanceHtml = `
        <div class="detail-field">
          <div class="detail-field-label">RESTANTE</div>
          <div class="detail-field-value">${fmtDays(info.remaining)} día${
        fmtDays(info.remaining) === "1" ? "" : "s"
      }</div>
          <div class="detail-progress-track"><div class="detail-progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }

    return `
      <div class="detail-field">
        <div class="detail-field-label">FECHA</div>
        <div class="detail-field-value">${fmtDate(request.dateFrom)} - ${fmtDate(request.dateTo)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">SOLICITADO</div>
        <div class="detail-field-value">${fmtDays(request.days)} día${
      fmtDays(request.days) === "1" ? "" : "s"
    }</div>
      </div>
      ${allowanceHtml}
      <div class="detail-field">
        <div class="detail-field-label">APROBACIÓN</div>
        <div class="detail-approval-row">
          ${avatarHtml(rosterApprover || { name: request.resolvedBy || "—" }, 30)}
          <span>${esc(request.resolvedBy || "—")}</span>
        </div>
      </div>
      <div class="detail-overlap-section">
        <div class="section-title">Ausente al mismo tiempo</div>
        ${renderOverlapRow(deptName, overlap.sameDept, overlap.byDayDept, request.id, "dept")}
        ${renderOverlapRow("Toda la organización", overlap.all, overlap.byDayAll, request.id, "all")}
      </div>
    `;
  }

  function renderDetailHistory(request) {
    const entries = [{ label: "Creación", at: request.requestedAt, by: request.userName, kind: "created" }];
    if (request.status !== "pending" && request.resolvedAt) {
      const label =
        { approved: "Aprobación final", rejected: "Rechazada", cancelled: "Cancelada" }[request.status] ||
        "Resuelta";
      entries.push({
        label,
        at: request.resolvedAt,
        by: request.resolvedBy,
        kind: request.status === "approved" ? "approved" : "negative",
      });
    }
    const rows = entries
      .map((e) => {
        const u = APP.roster.find((x) => x.name === e.by);
        return `
        <div class="history-row">
          <div class="history-icon history-icon-${e.kind}">${
          e.kind === "created" ? "✎" : e.kind === "approved" ? "✓" : "✕"
        }</div>
          <div class="history-main">
            <div class="history-label">${esc(e.label)}</div>
            <div class="faint mono">${fmtDateTime(e.at)}</div>
          </div>
          <div class="history-by">
            ${avatarHtml(u || { name: e.by }, 26)}
            <span>${esc(e.by || "—")}</span>
          </div>
        </div>
      `;
      })
      .join("");
    return `<div class="section-title">Historial</div><div class="history-list">${rows}</div>`;
  }

  function renderDetailAttachments(request, dp) {
    return `<div class="section-title">Adjuntos</div>${renderAttachmentsBody(request, dp)}`;
  }

  function renderDetailPanel() {
    const dp = APP.detailPanel;
    const request = APP.requests.find((r) => r.id === dp.requestId);
    if (!request) return "";
    const type = APP.absenceTypes.find((t) => t.id === request.type);
    const rosterUser = APP.roster.find((u) => u.id === request.userId);

    const tabs = [
      { id: "info", icon: infoIconSvg(), label: "Información" },
      {
        id: "adjuntos",
        icon: paperclipIconSvg(),
        label: "Adjuntos",
        count: dp.attachments ? dp.attachments.length : 0,
      },
      { id: "historial", icon: historyIconSvg(), label: "Historial" },
    ];
    const tabsHtml = tabs
      .map(
        (t) => `
        <button type="button" class="detail-tab-btn ${dp.tab === t.id ? "active" : ""}" data-action="switch-detail-tab" data-tab="${t.id}" title="${esc(
          t.label
        )}">
          ${t.icon}
          ${t.count != null ? `<span class="detail-tab-count">${t.count}</span>` : ""}
        </button>
      `
      )
      .join("");

    let body = "";
    if (dp.tab === "adjuntos") body = renderDetailAttachments(request, dp);
    else if (dp.tab === "historial") body = renderDetailHistory(request);
    else body = renderDetailInfo(request);

    return `
      <div class="detail-panel-overlay">
        <div class="detail-panel">
          <div class="detail-panel-topbar">
            <button type="button" class="detail-close-btn" data-action="close-detail-panel">✕</button>
          </div>
          <div class="detail-panel-header">
            ${avatarHtml(rosterUser || { name: request.userName }, 56)}
            <div class="detail-panel-headinfo">
              <span class="badge ${STATUS_BADGE_CLASS[request.status]}">${STATUS_LABELS[
      request.status
    ].toUpperCase()}</span>
              <div class="detail-panel-name">${esc(request.userName)}</div>
              <div class="detail-panel-type">${esc(type ? type.name : request.type)}</div>
            </div>
          </div>
          <div class="detail-panel-body-wrap">
            <div class="detail-tab-rail">${tabsHtml}</div>
            <div class="detail-panel-body">${body}</div>
          </div>
        </div>
      </div>
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

  function onHoverPopoverEnter(e) {
    const wrap = e.target.closest(HOVER_POPOVER_SELECTOR);
    if (!wrap) return;
    root.querySelectorAll(`${HOVER_POPOVER_SELECTOR}.popover-open`).forEach((w) => {
      if (w !== wrap) w.classList.remove("popover-open");
    });
  }

  function onHoverPopoverLeave(e) {
    const wrap = e.target.closest(HOVER_POPOVER_SELECTOR);
    if (!wrap) return;
    if (wrap.contains(e.relatedTarget)) return;
    wrap.classList.remove("popover-open");
  }

  function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "FORM") {
      // Clic fuera de cualquier popover: lo cierra.
      if (!e.target.closest(".report-value-popover")) {
        root
          .querySelectorAll(".report-value-wrap.popover-open")
          .forEach((w) => w.classList.remove("popover-open"));
      }
      if (APP.userMenuOpen && !e.target.closest(".user-menu-wrap")) {
        APP.userMenuOpen = false;
        render();
      }
      return;
    }
    const action = el.dataset.action;
    switch (action) {
      case "toggle-report-popover": {
        const wasOpen = el.classList.contains("popover-open");
        root
          .querySelectorAll(".report-value-wrap.popover-open")
          .forEach((w) => w.classList.remove("popover-open"));
        if (!wasOpen) el.classList.add("popover-open");
        break;
      }
      case "open-request-detail": {
        const reqId = el.dataset.id;
        APP.detailPanel = {
          requestId: reqId,
          tab: "info",
          attachments: null,
          attachLoading: false,
          attachError: "",
          uploading: false,
        };
        render();
        loadAttachmentsFor(reqId);
        break;
      }
      case "close-detail-panel":
        APP.detailPanel = null;
        render();
        break;
      case "switch-detail-tab":
        if (APP.detailPanel) APP.detailPanel.tab = el.dataset.tab;
        render();
        break;
      case "open-overlap-modal":
        APP.modal = { type: "overlap", requestId: el.dataset.id, scope: el.dataset.scope };
        render();
        break;
      case "open-attachments-modal": {
        const reqId = el.dataset.id;
        APP.modal = {
          type: "attachments",
          requestId: reqId,
          attachments: null,
          attachLoading: false,
          attachError: "",
          uploading: false,
        };
        APP.modalError = "";
        render();
        loadAttachmentsFor(reqId);
        break;
      }
      case "open-attachment-popup": {
        e.preventDefault();
        const url = el.dataset.url;
        window.open(
          url,
          "_blank",
          "noopener,noreferrer,width=1000,height=800,menubar=no,toolbar=no,location=no,status=no"
        );
        break;
      }
      case "nav":
        APP.route = el.dataset.route;
        APP.mobileMenuOpen = false;
        render();
        break;
      case "toggle-mobile-menu":
        APP.mobileMenuOpen = !APP.mobileMenuOpen;
        render();
        break;
      case "toggle-user-menu":
        APP.userMenuOpen = !APP.userMenuOpen;
        render();
        break;
      case "logout":
        APP.userMenuOpen = false;
        handleLogout();
        break;
      case "open-user-profile":
        APP.modal = { type: "editProfile" };
        APP.modalError = "";
        APP.userMenuOpen = false;
        APP.mobileMenuOpen = false;
        render();
        break;
      case "open-change-password":
        APP.modal = { type: "changePassword" };
        APP.modalError = "";
        APP.mobileMenuOpen = false;
        APP.userMenuOpen = false;
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
      case "reqcal-prev-month":
        shiftRequestCalMonth(-1);
        break;
      case "reqcal-next-month":
        shiftRequestCalMonth(1);
        break;
      case "reqcal-today": {
        const now = new Date();
        APP.requestCalMonth = { year: now.getFullYear(), month: now.getMonth() };
        render();
        break;
      }
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
      case "open-delete-worker-modal":
        APP.modal = { type: "deleteWorker", userId: el.dataset.id };
        APP.modalError = "";
        render();
        break;
      case "confirm-delete-worker":
        handleDeleteWorker();
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
      case "open-import-calamari-modal":
        APP.modal = { type: "importCalamari", step: "upload" };
        APP.modalError = "";
        render();
        break;
      case "confirm-import-calamari":
        handleConfirmImportCalamari();
        break;
      case "toggle-import-row": {
        const idx = Number(el.dataset.index);
        if (APP.modal && APP.modal.selected) {
          if (el.checked) APP.modal.selected.add(idx);
          else APP.modal.selected.delete(idx);
          const btn = root.querySelector(".import-confirm-btn");
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
      case "import-calamari-form":
        return handleImportCalamariUpload(fd);
      case "login-form":
        return handleLogin(fd);
      case "request-form":
        return handleRequestSubmit(fd);
      case "change-password-form":
        return handleChangePassword(fd);
      case "edit-profile-form":
        return handleEditProfile(fd);
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
      case "upload-attachment-form":
        return handleUploadAttachment(fd, form);
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
        dateFrom: formatISODate(new Date()),
        dateTo: formatISODate(new Date()),
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

  async function handleEditProfile(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch(`/api/users/${APP.me.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email") || "",
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
      showBanner("success", "Perfil actualizado");
      await loadBootstrap(true);
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

  async function handleDeleteWorker() {
    const userId = APP.modal && APP.modal.userId;
    if (!userId) return;
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido eliminar el trabajador";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", "Trabajador eliminado");
      await loadBootstrap(true);
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

  async function handleImportCalamariUpload(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch("/api/reports/calamari-import", { method: "POST", body: fd });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido analizar el archivo";
        render();
        return;
      }
      const matchedIndexes = data.periods
        .map((p, i) => (p.matchedUserId ? i : null))
        .filter((i) => i !== null);
      APP.modal = {
        type: "importCalamari",
        step: "review",
        periods: data.periods,
        selected: new Set(matchedIndexes),
      };
      render();
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  async function handleConfirmImportCalamari() {
    const m = APP.modal;
    if (!m || !m.periods) return;
    const selected = m.periods
      .filter((_, i) => m.selected.has(i))
      .map((p) => ({
        userId: p.matchedUserId,
        type: p.type,
        dateFrom: p.dateFrom,
        dateTo: p.dateTo,
        days: p.days,
        halfStart: p.halfStart,
        halfEnd: p.halfEnd,
      }));
    if (!selected.length) {
      APP.modalError = "Selecciona al menos una ausencia";
      render();
      return;
    }
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await fetch("/api/reports/calamari-import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periods: selected }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido importar";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", `${data.imported} ausencia(s) importada(s)`);
      await loadBootstrap(true);
    } catch (err) {
      APP.modalLoading = false;
      APP.modalError = "Error de conexión";
      render();
    }
  }

  function getAttachmentsContext(requestId) {
    if (APP.detailPanel && APP.detailPanel.requestId === requestId) return APP.detailPanel;
    if (APP.modal && APP.modal.type === "attachments" && APP.modal.requestId === requestId) {
      return APP.modal;
    }
    return null;
  }

  async function loadAttachmentsFor(requestId) {
    const ctx = getAttachmentsContext(requestId);
    if (!ctx) return;
    ctx.attachLoading = true;
    render();
    try {
      const res = await fetch(`/api/requests/${requestId}/attachments`);
      const data = await res.json().catch(() => ({}));
      const ctx2 = getAttachmentsContext(requestId);
      if (!ctx2) return;
      ctx2.attachLoading = false;
      ctx2.attachments = res.ok ? data.attachments : [];
      render();
    } catch (err) {
      const ctx2 = getAttachmentsContext(requestId);
      if (!ctx2) return;
      ctx2.attachLoading = false;
      ctx2.attachments = [];
      render();
    }
  }

  async function handleUploadAttachment(fd, form) {
    const requestId = form.dataset.requestId;
    const ctx = getAttachmentsContext(requestId);
    if (!ctx) return;
    ctx.uploading = true;
    ctx.attachError = "";
    render();
    try {
      const res = await fetch(`/api/requests/${requestId}/attachments`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      const ctx2 = getAttachmentsContext(requestId);
      if (!ctx2) return;
      ctx2.uploading = false;
      if (!res.ok) {
        ctx2.attachError = data.error || "No se ha podido subir el archivo";
        render();
        return;
      }
      showBanner("success", "Justificante adjuntado");
      await loadAttachmentsFor(requestId);
    } catch (err) {
      const ctx2 = getAttachmentsContext(requestId);
      if (!ctx2) return;
      ctx2.uploading = false;
      ctx2.attachError = "Error de conexión";
      render();
    }
  }
}
