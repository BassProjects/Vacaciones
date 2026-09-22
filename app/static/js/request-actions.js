import { apiFetch } from './api.js';
import { todayISO } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {loadBootstrap, render, showBanner} = ctx.calls;
  async function handleRequestSubmit(fd) {
    const payload = {type:fd.get('type'), dateFrom:fd.get('dateFrom'), dateTo:fd.get('dateTo'),
      halfStart:fd.get('halfStart') === 'on', halfEnd:fd.get('halfEnd') === 'on', note:String(fd.get('note') || '').trim()};
    APP.requestFormError = '';
    APP.requestFormLoading = true;
    APP.pendingRequestKey = crypto.randomUUID();
    render();
    try {
      const response = await apiFetch('/api/requests/preview', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Solicitud no válida');
      if (data.overlap) throw new Error('Ya existe una solicitud pendiente o aprobada en esos días');
      APP.preview = data;
      APP.requestFormLoading = false;
      if (data.shortfalls.length) {
        if (APP.config.overAllowance === 'block') throw new Error('La política configurada no permite superar el saldo disponible');
        APP.pendingRequestPayload = payload;
        APP.modal = {type:'confirmOverAllowance', extra:{...data.shortfalls[0], shortfalls:data.shortfalls}};
        render();
        return;
      }
      await submitRequestPayload(payload);
    } catch (error) {
      APP.requestFormLoading = false;
      APP.requestFormError = error.message;
      render();
    }
  }

  async function submitRequestPayload(payload) {
    APP.requestFormLoading = true;
    APP.modal = null;
    render();
    try {
      const res = await apiFetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": APP.pendingRequestKey || (APP.pendingRequestKey = crypto.randomUUID()) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      APP.requestFormLoading = false;
      if (!res.ok) {
        APP.requestFormError = data.error || "No se ha podido enviar la solicitud";
        render();
        return;
      }
      APP.pendingRequestKey = null;
      APP.requestFormError = "";
      APP.requestFormValues = {
        type: "vacaciones",
        dateFrom: todayISO(),
        dateTo: todayISO(),
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
      const res = await apiFetch(`/api/requests/${id}`, {
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
      const res = await apiFetch(`/api/requests/${id}`, {
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
  return {handleRequestSubmit, submitRequestPayload, handleApprove, handleResolveWithNote};
}
