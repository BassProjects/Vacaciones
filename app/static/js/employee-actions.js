import { apiFetch } from './api.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {loadBootstrap, render, showBanner} = ctx.calls;
  async function handleAddWorker(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await apiFetch("/api/users", {
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

  async function handleInviteWorkers(fd) {
    const lines = String(fd.get("emails") || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      APP.modalError = "Añade al menos un correo";
      render();
      return;
    }
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await apiFetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          department: fd.get("department") || null,
          role: fd.get("role"),
        }),
      });
      const data = await res.json();
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se han podido enviar las invitaciones";
        render();
        return;
      }
      APP.modal = { type: "inviteWorkers", step: "result", results: data };
      render();
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
      const res = await apiFetch(`/api/users/${userId}`, {
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
      const res = await apiFetch(`/api/users/${userId}/reset-password`, {
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
      const res = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      APP.modalLoading = false;
      if (!res.ok) {
        APP.modalError = data.error || "No se ha podido eliminar el trabajador";
        render();
        return;
      }
      APP.modal = null;
      showBanner("success", "Trabajador desactivado");
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
      const res = await apiFetch("/api/holidays", {
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
      const res = await apiFetch(`/api/holidays/${encodeURIComponent(date)}`, { method: "DELETE" });
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
  return {handleAddWorker, handleInviteWorkers, handleEditWorker, handleResetPassword, handleDeleteWorker, handleAddHoliday, handleDeleteHoliday};
}
