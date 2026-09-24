import { apiFetch } from './api.js';
import { refreshInvitationDelivery } from './invitation-delivery.js';
import { currentYear, esc, fmtDays, passwordFieldHtml, setBalances, wordmarkHtml } from './shared.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  const {handleLogout, renderAllowanceBars, renderChangePasswordModal, renderShell} = ctx.calls;
  function onDocumentMouseUp() {
    APP.reqCalDragging = false;
  }

  async function init() {
    try {
      const res = await apiFetch("/api/auth/me");
      const data = await res.json();
      APP.authChecked = true;
      if (data.user) {
        APP.me = data.user;
        if (data.user.mustChangePassword) { APP.view = 'password-required'; render(); return; }
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
    if (runtime.bootstrapLoading) return;
    runtime.bootstrapLoading = true;
    if (!silent) { APP.loading = true; render(); }
    try {
      const years = [...new Set([currentYear(), APP.calendar.year, APP.requestCalMonth.year])];
      let first = null;
      const requests = new Map();
      let mergedBalances = {};
      for (const year of years) {
        const response = await apiFetch(`/api/bootstrap?year=${year}`);
        if (response.status === 401) { await handleLogout(); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pueden cargar los datos');
        if (!first) first = data;
        for (const [id, balances] of Object.entries(data.balances || {})) {
          mergedBalances[id] = { ...(mergedBalances[id] || {}), ...balances };
        }
        data.requests.forEach(r => requests.set(r.id, r));
        if (data.requests.length === data.requestsPageSize) {
          let page = 2;
          while (true) {
            const nextResponse = await apiFetch(`/api/requests?year=${year}&page=${page}`);
            const next = await nextResponse.json();
            if (!nextResponse.ok) throw new Error(next.error || 'No se puede cargar el historial');
            next.requests.forEach(r => requests.set(r.id, r));
            if (!next.hasMore) break;
            page += 1;
          }
        }
      }
      APP.me = first.me;
    APP.adminReport = first.adminReport;
      APP.config = first.config;
      APP.departments = first.departments;
      APP.absenceTypes = first.absenceTypes;
      APP.holidays = first.holidays;
      APP.requests = [...requests.values()].sort((a,b) => String(b.requestedAt || b.dateFrom).localeCompare(String(a.requestedAt || a.dateFrom)));
      APP.users = first.users;
      APP.birthdays = first.birthdays || [];
      APP.roster = first.roster || [];
      APP.managedDepartments = first.managedDepartments || [];
      APP.serverDate = first.serverDate;
      APP.balances = mergedBalances;
      setBalances(mergedBalances);
      APP.loading = false;
      if (!(silent && (APP.modal || APP.reqCalDragging))) render();
    } catch (error) {
      APP.loading = false;
      APP.banner = {type:'error', text:error.message || 'No se han podido actualizar los datos'};
      if (!APP.me) { APP.view = 'login'; APP.loginError = APP.banner.text; }
      render();
    } finally { runtime.bootstrapLoading = false; }
  }

  function startPolling() {
    stopPolling();
    runtime.pollTimer = setInterval(() => {
      loadBootstrap(true);
      refreshInvitationDelivery(APP, runtime, render);
    }, 20000);
  }

  function stopPolling() {
    if (runtime.pollTimer) {
      clearInterval(runtime.pollTimer);
      runtime.pollTimer = null;
    }
  }

  function showBanner(type, text) {
    APP.banner = { type, text };
    if (runtime.bannerTimer) clearTimeout(runtime.bannerTimer);
    runtime.bannerTimer = setTimeout(() => {
      APP.banner = null;
      render();
    }, 4000);
  }

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
    const refresh = () => {
      const fd = new FormData(formEl);
      const payload = {type:fd.get('type') || 'vacaciones', dateFrom:fd.get('dateFrom') || '',
        dateTo:fd.get('dateTo') || '', halfStart:fd.get('halfStart') === 'on',
        halfEnd:fd.get('halfEnd') === 'on', note:String(fd.get('note') || '')};
      APP.requestFormValues = payload;
      syncReqCalSelection(payload.dateFrom, payload.dateTo);
      clearTimeout(runtime.previewTimer);
      const signature = JSON.stringify(payload);
      runtime.previewSignature = signature;
      runtime.previewTimer = setTimeout(async () => {
        if (!payload.dateFrom || !payload.dateTo) return;
        try {
          const response = await apiFetch('/api/requests/preview', {method:'POST',
            headers:{'Content-Type':'application/json'}, body:signature});
          const result = await response.json();
          if (runtime.previewSignature !== signature) return;
          const output = formEl.querySelector('[data-role="days-preview"]');
          if (output) output.textContent = response.ok ? fmtDays(result.days) : '—';
          APP.preview = response.ok ? result : null;
          const bars = formEl.querySelector('[data-role="allowance-bars"]');
          if (bars) bars.innerHTML = response.ok ? renderAllowanceBars(payload) : `<p class="faint">${esc(result.error || 'Revisa las fechas')}</p>`;
        } catch (error) {
          const output = formEl.querySelector('[data-role="days-preview"]');
          if (output) output.textContent = '—';
        }
      }, 250);
    };
    formEl.addEventListener('input', refresh);
    formEl.addEventListener('change', refresh);
    refresh();
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
    if (APP.view === 'password-required') return `<div class="login-screen"><div class="login-card"><p>Debes cambiar tu contraseña para continuar.</p>${renderChangePasswordModal()}</div></div>`;
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
            Si necesitas acceso o has olvidado tu contraseña, contacta con la administración. No enviamos contraseñas por correo.
          </div>
        </div>
      </div>
    `;
  }
  return {onDocumentMouseUp, init, loadBootstrap, startPolling, stopPolling, showBanner, render, runPostRenderHooks, syncReqCalSelection, attachRequestFormLivePreview, attachRequestCalendarDrag, buildHTML, renderSplash, renderLogin};
}
