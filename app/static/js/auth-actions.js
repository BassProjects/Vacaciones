import { apiFetch } from './api.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {loadBootstrap, render, showBanner, startPolling, stopPolling} = ctx.calls;
  async function handleLogin(fd) {
    APP.loginLoading = true;
    APP.loginError = "";
    render();
    try {
      const res = await apiFetch("/api/auth/login", {
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
      APP.me = data.user;
      if (data.user.mustChangePassword) { APP.view = 'password-required'; render(); return; }
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
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      // ignorar errores de red al cerrar sesión
    }
    APP.me = null;
    APP.view = "login";
    APP.route = "perfil";
    APP.loginError = "";
    render();
  }

  async function handleChangePassword(fd) {
    APP.modalLoading = true;
    APP.modalError = "";
    render();
    try {
      const res = await apiFetch("/api/auth/change-password", {
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
      await handleLogout();
      APP.loginError = 'Contraseña actualizada. Inicia sesión de nuevo.';
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
      const res = await apiFetch(`/api/users/${APP.me.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email") || "",
          birthDate: fd.get("birthDate") || null,
          shareBirthday: fd.get("shareBirthday") === "on",
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
  return {handleLogin, handleLogout, handleChangePassword, handleEditProfile};
}
