import { apiFetch } from './api.js';
import { eyeIconSvg } from './shared.js';
import { manageWorker } from './worker-management.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {handleAddHoliday, handleAddWorker, handleApprove, handleChangePassword, handleConfirmImportCalamari, handleConfirmImportHolidays, handleDeleteHoliday, handleDeleteWorker, handleEditProfile, handleEditWorker, handleImportCalamariUpload, handleImportHolidaysUpload, handleInviteWorkers, handleLogin, handleLogout, handleRequestSubmit, handleResetPassword, handleResolveWithNote, handleUploadAttachment, loadAttachmentsFor, loadRequestDetail, render, shiftCalendarMonth, shiftRequestCalMonth, submitRequestPayload, toggleDeptFilter} = ctx.calls;
  function onHoverPopoverEnter(e) {
    const wrap = e.target.closest(runtime.HOVER_POPOVER_SELECTOR);
    if (!wrap) return;
    root.querySelectorAll(`${runtime.HOVER_POPOVER_SELECTOR}.popover-open`).forEach((w) => {
      if (w !== wrap) w.classList.remove("popover-open");
    });
  }

  function onHoverPopoverLeave(e) {
    const wrap = e.target.closest(runtime.HOVER_POPOVER_SELECTOR);
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
      // Clic fuera del calendario de "Solicitar" (y fuera del propio
      // formulario, para no perder la fecha al enviar): desmarca el día.
      // Solo aplica si ese calendario está realmente en pantalla, para no
      // interferir con el envío de cualquier otro formulario de la app.
      if (
        root.querySelector(".request-cal-col") &&
        APP.requestFormValues.dateFrom &&
        !e.target.closest(".request-cal-col") &&
        !e.target.closest('form[data-action="request-form"]')
      ) {
        APP.requestFormValues.dateFrom = "";
        APP.requestFormValues.dateTo = "";
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
        loadRequestDetail(el.dataset.id);
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
      case "open-invite-modal":
        APP.modal = { type: "inviteWorkers" };
        APP.modalError = "";
        render();
        break;
      case "open-reset-data-modal":
        window.location.assign("/admin");
        return;
      case "removed-reset-data-modal":
        APP.modal = { type: "resetData" };
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
      case "manage-worker":
        if (APP.modalLoading) return;
        APP.modal = {type: 'manageWorker', userId: el.dataset.id, operation: el.dataset.operation, requestKey: crypto.randomUUID()};
        APP.modalError = '';
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
        submitRequestPayload({...APP.pendingRequestPayload, overAllowanceAcknowledged:true});
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
      case "invite-workers-form":
        return handleInviteWorkers(fd);
      case "reset-data-form":
        window.location.assign("/admin"); return;
      case "manage-worker-form":
        return manageWorker(ctx, fd);
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
  return {onHoverPopoverEnter, onHoverPopoverLeave, onClick, onSubmit};
}
