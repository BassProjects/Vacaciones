import { todayISO } from './shared.js';
import {createFeature as feature0} from './core.js';
import {createFeature as feature1} from './shell.js';
import {createFeature as feature2} from './request-views.js';
import {createFeature as feature3} from './calendar.js';
import {createFeature as feature4} from './approvals.js';
import {createFeature as feature5} from './employees.js';
import {createFeature as feature6} from './reports.js';
import {createFeature as feature7} from './request-dialogs.js';
import {createFeature as feature8} from './employee-dialogs.js';
import {createFeature as feature9} from './import-dialogs.js';
import {createFeature as feature10} from './details.js';
import {createFeature as feature11} from './events.js';
import {createFeature as feature12} from './auth-actions.js';
import {createFeature as feature13} from './request-actions.js';
import {createFeature as feature14} from './employee-actions.js';
import {createFeature as feature15} from './import-actions.js';
import {createFeature as feature16} from './attachment-actions.js';
const root = document.querySelector('#app-container');
if (root) {
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
      dateFrom: todayISO(),
      dateTo: todayISO(),
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
APP.managedDepartments = []; APP.balances = {}; APP.preview = null; APP.pendingRequestKey = null;
const runtime = {pollTimer:null, bannerTimer:null, previewTimer:null, HOVER_POPOVER_SELECTOR:'.cal-chip-wrap, .report-value-wrap'};
const registry = {}; const calls = {};
calls.onDocumentMouseUp = (...args) => registry.onDocumentMouseUp(...args);
calls.init = (...args) => registry.init(...args);
calls.loadBootstrap = (...args) => registry.loadBootstrap(...args);
calls.startPolling = (...args) => registry.startPolling(...args);
calls.stopPolling = (...args) => registry.stopPolling(...args);
calls.showBanner = (...args) => registry.showBanner(...args);
calls.render = (...args) => registry.render(...args);
calls.runPostRenderHooks = (...args) => registry.runPostRenderHooks(...args);
calls.syncReqCalSelection = (...args) => registry.syncReqCalSelection(...args);
calls.attachRequestFormLivePreview = (...args) => registry.attachRequestFormLivePreview(...args);
calls.attachRequestCalendarDrag = (...args) => registry.attachRequestCalendarDrag(...args);
calls.buildHTML = (...args) => registry.buildHTML(...args);
calls.renderSplash = (...args) => registry.renderSplash(...args);
calls.renderLogin = (...args) => registry.renderLogin(...args);
calls.renderShell = (...args) => registry.renderShell(...args);
calls.renderBanner = (...args) => registry.renderBanner(...args);
calls.navItemsHtml = (...args) => registry.navItemsHtml(...args);
calls.navBtn = (...args) => registry.navBtn(...args);
calls.sidebarFootHtml = (...args) => registry.sidebarFootHtml(...args);
calls.renderSidebar = (...args) => registry.renderSidebar(...args);
calls.renderTopbar = (...args) => registry.renderTopbar(...args);
calls.renderMobileNav = (...args) => registry.renderMobileNav(...args);
calls.renderContent = (...args) => registry.renderContent(...args);
calls.renderProfileView = (...args) => registry.renderProfileView(...args);
calls.profileTabBtn = (...args) => registry.profileTabBtn(...args);
calls.renderRequestForm = (...args) => registry.renderRequestForm(...args);
calls.renderRequestCalendar = (...args) => registry.renderRequestCalendar(...args);
calls.renderAllowanceBars = (...args) => registry.renderAllowanceBars(...args);
calls.renderMyRequests = (...args) => registry.renderMyRequests(...args);
calls.renderAvailability = (...args) => registry.renderAvailability(...args);
calls.shiftCalendarMonth = (...args) => registry.shiftCalendarMonth(...args);
calls.shiftRequestCalMonth = (...args) => registry.shiftRequestCalMonth(...args);
calls.toggleDeptFilter = (...args) => registry.toggleDeptFilter(...args);
calls.renderCalendarView = (...args) => registry.renderCalendarView(...args);
calls.renderRosterPanel = (...args) => registry.renderRosterPanel(...args);
calls.getApprovableRequests = (...args) => registry.getApprovableRequests(...args);
calls.renderApprovalsView = (...args) => registry.renderApprovalsView(...args);
calls.renderPendingList = (...args) => registry.renderPendingList(...args);
calls.renderApprovedList = (...args) => registry.renderApprovedList(...args);
calls.renderAdminView = (...args) => registry.renderAdminView(...args);
calls.renderAdminDangerZone = (...args) => registry.renderAdminDangerZone(...args);
calls.renderAdminEmployees = (...args) => registry.renderAdminEmployees(...args);
calls.renderAdminHolidays = (...args) => registry.renderAdminHolidays(...args);
calls.renderAdminAllRequests = (...args) => registry.renderAdminAllRequests(...args);
calls.workersForRequests = (...args) => registry.workersForRequests(...args);
calls.computeTypeWorkerCounts = (...args) => registry.computeTypeWorkerCounts(...args);
calls.computeDepartmentTypeCounts = (...args) => registry.computeDepartmentTypeCounts(...args);
calls.reportValuePopoverHtml = (...args) => registry.reportValuePopoverHtml(...args);
calls.reportBarRow = (...args) => registry.reportBarRow(...args);
calls.reportStackedBarRow = (...args) => registry.reportStackedBarRow(...args);
calls.computeGlobalAwayGauge = (...args) => registry.computeGlobalAwayGauge(...args);
calls.renderGlobalGauge = (...args) => registry.renderGlobalGauge(...args);
calls.renderAdminReports = (...args) => registry.renderAdminReports(...args);
calls.renderModal = (...args) => registry.renderModal(...args);
calls.renderRejectModal = (...args) => registry.renderRejectModal(...args);
calls.renderCancelModal = (...args) => registry.renderCancelModal(...args);
calls.renderConfirmOverAllowanceModal = (...args) => registry.renderConfirmOverAllowanceModal(...args);
calls.renderChangePasswordModal = (...args) => registry.renderChangePasswordModal(...args);
calls.renderEditProfileModal = (...args) => registry.renderEditProfileModal(...args);
calls.renderWorkerFormModal = (...args) => registry.renderWorkerFormModal(...args);
calls.renderInviteWorkersModal = (...args) => registry.renderInviteWorkersModal(...args);
calls.renderResetPasswordModal = (...args) => registry.renderResetPasswordModal(...args);
calls.renderDeleteWorkerModal = (...args) => registry.renderDeleteWorkerModal(...args);
calls.renderAddHolidayModal = (...args) => registry.renderAddHolidayModal(...args);
calls.renderImportHolidaysModal = (...args) => registry.renderImportHolidaysModal(...args);
calls.renderImportCalamariModal = (...args) => registry.renderImportCalamariModal(...args);
calls.renderAttachmentsModal = (...args) => registry.renderAttachmentsModal(...args);
calls.overlapDayHeaderParts = (...args) => registry.overlapDayHeaderParts(...args);
calls.renderOverlapModal = (...args) => registry.renderOverlapModal(...args);
calls.canUploadAttachment = (...args) => registry.canUploadAttachment(...args);
calls.canCancelRequest = (...args) => registry.canCancelRequest(...args);
calls.renderAttachmentsBody = (...args) => registry.renderAttachmentsBody(...args);
calls.usersOnDay = (...args) => registry.usersOnDay(...args);
calls.buildOverlapScope = (...args) => registry.buildOverlapScope(...args);
calls.computeOverlapping = (...args) => registry.computeOverlapping(...args);
calls.renderOverlapAvatars = (...args) => registry.renderOverlapAvatars(...args);
calls.renderOverlapSparkline = (...args) => registry.renderOverlapSparkline(...args);
calls.renderOverlapRow = (...args) => registry.renderOverlapRow(...args);
calls.renderDetailInfo = (...args) => registry.renderDetailInfo(...args);
calls.renderDetailHistory = (...args) => registry.renderDetailHistory(...args);
calls.renderDetailAttachments = (...args) => registry.renderDetailAttachments(...args);
calls.renderDetailPanel = (...args) => registry.renderDetailPanel(...args);
calls.deptPillHtml = (...args) => registry.deptPillHtml(...args);
calls.typeName = (...args) => registry.typeName(...args);
calls.onHoverPopoverEnter = (...args) => registry.onHoverPopoverEnter(...args);
calls.onHoverPopoverLeave = (...args) => registry.onHoverPopoverLeave(...args);
calls.onClick = (...args) => registry.onClick(...args);
calls.onSubmit = (...args) => registry.onSubmit(...args);
calls.handleLogin = (...args) => registry.handleLogin(...args);
calls.handleLogout = (...args) => registry.handleLogout(...args);
calls.handleRequestSubmit = (...args) => registry.handleRequestSubmit(...args);
calls.submitRequestPayload = (...args) => registry.submitRequestPayload(...args);
calls.handleApprove = (...args) => registry.handleApprove(...args);
calls.handleResolveWithNote = (...args) => registry.handleResolveWithNote(...args);
calls.handleChangePassword = (...args) => registry.handleChangePassword(...args);
calls.handleEditProfile = (...args) => registry.handleEditProfile(...args);
calls.handleAddWorker = (...args) => registry.handleAddWorker(...args);
calls.handleInviteWorkers = (...args) => registry.handleInviteWorkers(...args);
calls.handleEditWorker = (...args) => registry.handleEditWorker(...args);
calls.handleResetPassword = (...args) => registry.handleResetPassword(...args);
calls.handleDeleteWorker = (...args) => registry.handleDeleteWorker(...args);
calls.handleAddHoliday = (...args) => registry.handleAddHoliday(...args);
calls.handleDeleteHoliday = (...args) => registry.handleDeleteHoliday(...args);
calls.handleImportHolidaysUpload = (...args) => registry.handleImportHolidaysUpload(...args);
calls.handleConfirmImportHolidays = (...args) => registry.handleConfirmImportHolidays(...args);
calls.handleImportCalamariUpload = (...args) => registry.handleImportCalamariUpload(...args);
calls.handleConfirmImportCalamari = (...args) => registry.handleConfirmImportCalamari(...args);
calls.getAttachmentsContext = (...args) => registry.getAttachmentsContext(...args);
calls.loadAttachmentsFor = (...args) => registry.loadAttachmentsFor(...args);
calls.handleUploadAttachment = (...args) => registry.handleUploadAttachment(...args);
calls.loadRequestDetail = (...args) => registry.loadRequestDetail(...args);
const context = {APP, root, runtime, calls};
Object.assign(registry, feature0(context));
Object.assign(registry, feature1(context));
Object.assign(registry, feature2(context));
Object.assign(registry, feature3(context));
Object.assign(registry, feature4(context));
Object.assign(registry, feature5(context));
Object.assign(registry, feature6(context));
Object.assign(registry, feature7(context));
Object.assign(registry, feature8(context));
Object.assign(registry, feature9(context));
Object.assign(registry, feature10(context));
Object.assign(registry, feature11(context));
Object.assign(registry, feature12(context));
Object.assign(registry, feature13(context));
Object.assign(registry, feature14(context));
Object.assign(registry, feature15(context));
Object.assign(registry, feature16(context));
root.addEventListener('click', calls.onClick);
root.addEventListener('submit', calls.onSubmit);
root.addEventListener('mouseover', calls.onHoverPopoverEnter);
root.addEventListener('mouseout', calls.onHoverPopoverLeave);
document.addEventListener('mouseup', calls.onDocumentMouseUp);
calls.init();
window.addEventListener('pagehide', () => { calls.stopPolling(); clearTimeout(runtime.bannerTimer); clearTimeout(runtime.previewTimer); });
}
