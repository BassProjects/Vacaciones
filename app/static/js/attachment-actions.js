import { apiFetch } from './api.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {render, showBanner} = ctx.calls;
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
      const res = await apiFetch(`/api/requests/${requestId}/attachments`);
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
      const res = await apiFetch(`/api/requests/${requestId}/attachments`, {
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

  async function loadRequestDetail(id) {
    const item = APP.requests.find(r => r.id === id);
    if (!item?.private) return;
    try {
      const response = await apiFetch(`/api/requests/${encodeURIComponent(id)}`);
      if (response.ok) { Object.assign(item, await response.json()); render(); }
    } catch (error) { showBanner('error', 'No se ha podido cargar el historial'); }
  }
  return {getAttachmentsContext, loadAttachmentsFor, handleUploadAttachment, loadRequestDetail};
}
