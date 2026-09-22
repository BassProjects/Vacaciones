export const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};
export const STATUS_BADGE_CLASS = {
  pending: "badge-pending",
  approved: "badge-approved",
  rejected: "badge-rejected",
  cancelled: "badge-cancelled",
};

export const GLOBAL_AWAY_LIMIT_PCT = 30;

export function esc(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wordmarkHtml(size, onDark) {
  const src = onDark ? "/static/brand-logo-dark.png" : "/static/brand-logo-light.png";
  return `<img class="wordmark-logo" src="${src}" alt="SepiaMary" style="height:${size}" />`;
}

export function eyeIconSvg(crossedOut) {
  if (crossedOut) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.79 21.79 0 0 1-3.22 4.6M1 1l22 22M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

export function passwordFieldHtml({ label, name, autocomplete, minlength, value }) {
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

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Madrid",
    });
  } catch (err) {
    return String(value);
  }
}

export function fmtDays(n) {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

export function initials(name) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export const AVATAR_COLORS = [
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

export function avatarColor(name) {
  const key = (name || "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarHtml(user, size) {
  const px = size || 34;
  const fontPx = Math.round(px * 0.4);
  const name = user && user.name;
  const img = user && user.avatarUrl
    ? `<img class="avatar-img" src="${esc(user.avatarUrl)}" alt="" />`
    : "";
  return `<span class="avatar" style="width:${px}px;height:${px}px;font-size:${fontPx}px;background:${avatarColor(
    name
  )};color:#fff">${img}${esc(initials(name))}</span>`;
}

export function fmtBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function infoIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12" y2="8"/></svg>`;
}

export function paperclipIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
}

export function historyIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3" y2="6"/><line x1="3" y1="12" x2="3" y2="12"/><line x1="3" y1="18" x2="3" y2="18"/></svg>`;
}

export function roleLabel(role) {
  return (
    { worker: "Trabajador", manager: "Encargado de departamento", admin: "Superusuario" }[role] ||
    role
  );
}

export function currentYear() { return Number(todayISO().slice(0,4)); }

export function currentYearMonth() { return todayISO().slice(0,7); }

let authoritativeBalances = {};
export function setBalances(balances) { authoritativeBalances = balances; }
export function mergeBalances(userId, balances) {
  authoritativeBalances[userId] = {...(authoritativeBalances[userId] || {}), ...balances};
}
export function computeAllowance(user, requests, year, defaultAllowance) {
  return authoritativeBalances[user.id]?.[String(year)] || {allowance:0, consumed:0, pending:0, remaining:0, unavailable:true};
}
export function todayISO() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
}
