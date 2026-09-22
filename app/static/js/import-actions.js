import { apiFetch } from './api.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {loadBootstrap, render, showBanner} = ctx.calls;
  async function handleImportHolidaysUpload(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await apiFetch("/api/holidays/import", { method: "POST", body: fd });
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
        batchId: data.batchId,
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
      const res = await apiFetch("/api/holidays/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: m.batchId, selected: [...m.selected] }),
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
      const res = await apiFetch("/api/reports/calamari-import", { method: "POST", body: fd });
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
        batchId: data.batchId,
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
      const res = await apiFetch("/api/reports/calamari-import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: m.batchId, selected: [...m.selected] }),
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
  return {handleImportHolidaysUpload, handleConfirmImportHolidays, handleImportCalamariUpload, handleConfirmImportCalamari};
}
