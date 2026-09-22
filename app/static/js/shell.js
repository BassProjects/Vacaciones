import { apiFetch } from './api.js';
import { avatarHtml, esc, roleLabel, wordmarkHtml } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {getApprovableRequests, renderAdminView, renderApprovalsView, renderAvailability, renderCalendarView, renderDetailPanel, renderModal, renderMyRequests, renderRequestForm} = ctx.calls;
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
    if ((APP.me.role === "manager" || APP.me.role === "admin" || APP.managedDepartments?.length > 0)) {
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
  return {renderShell, renderBanner, navItemsHtml, navBtn, sidebarFootHtml, renderSidebar, renderTopbar, renderMobileNav, renderContent, renderProfileView, profileTabBtn};
}
