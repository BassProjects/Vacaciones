import { sendMail } from "./mailer";
import { ABSENCE_TYPES, DEPARTMENTS } from "./constants";

function typeInfo(typeId) {
  return ABSENCE_TYPES.find((t) => t.id === typeId) || { name: typeId, consumesAllowance: false };
}

function departmentName(deptId) {
  return DEPARTMENTS.find((d) => d.id === deptId)?.name || deptId;
}

function fmtDateEs(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function fmtDateOnly(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtRangeLabel(dateFrom, dateTo) {
  const fmt = new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const from = fmt.format(new Date(`${dateFrom}T00:00:00Z`));
  if (dateFrom === dateTo) return from;
  const to = fmt.format(new Date(`${dateTo}T00:00:00Z`));
  return `${from} – ${to}`;
}

function googleCalendarUrl({ title, dateFrom, dateTo, details }) {
  const start = dateFrom.replace(/-/g, "");
  const endExclusive = new Date(`${dateTo}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const end = endExclusive.toISOString().slice(0, 10).replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details: details || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function appUrl() {
  return (
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://electropolis-vacaciones-psi.vercel.app")
  );
}

async function getDepartmentManagers(pool, department, excludeUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM users
     WHERE role = 'manager' AND department = $1 AND active = TRUE
       AND email IS NOT NULL AND email <> ''`,
    [department]
  );
  return rows.filter((u) => u.id !== excludeUserId);
}

async function remainingAllowanceDays(pool, userId, year) {
  const { rows: userRows } = await pool.query("SELECT allowance_override FROM users WHERE id = $1", [
    userId,
  ]);
  const { rows: configRows } = await pool.query("SELECT default_allowance FROM app_config WHERE id = 1");
  const defaultAllowance = Number(configRows[0]?.default_allowance ?? 22.5);
  const override = userRows[0]?.allowance_override;
  const allowance = override != null ? Number(override) : defaultAllowance;

  const { rows: consumedRows } = await pool.query(
    `SELECT COALESCE(SUM(days), 0)::float AS consumed FROM requests
     WHERE user_id = $1 AND type = 'vacaciones' AND status = 'approved' AND date_from LIKE $2`,
    [userId, `${year}%`]
  );
  const consumed = Number(consumedRows[0]?.consumed || 0);
  return Math.max(0, allowance - consumed);
}

function wordmarkHtml() {
  return `<span style="font-size:20px;font-weight:800;font-family:Arial,sans-serif;"><span style="color:#123a5c;">sepia</span><span style="color:#8a9a1b;">mary</span></span>`;
}

function calendarBoxHtml({ worker, request, type }) {
  const rangeLabel = fmtRangeLabel(request.date_from, request.date_to);
  const url = googleCalendarUrl({
    title: `${worker.name} - ${type.name}`,
    dateFrom: request.date_from,
    dateTo: request.date_to,
    details: `${type.name} aprobada en Sepiamary Vacaciones.`,
  });
  return `
    <div style="border:1px solid #d7dee6;border-radius:12px;padding:16px 20px;margin-bottom:28px;background:#f4f7fb;">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#1a2b3c;">${rangeLabel}</div>
      <div style="font-size:14px;margin-bottom:14px;color:#1a2b3c;">🌴 ${worker.name} - ${type.name}</div>
      <a href="${url}" style="display:inline-block;background:#123a5c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:13px;">Añadir a Google Calendar</a>
    </div>
  `;
}

function historyHtml(entries) {
  return entries
    .map((e) => `${e.label} ${fmtDateOnly(e.at)}${e.by ? ` - ${e.by}` : ""}`)
    .join("<br/>");
}

async function requestInfoSectionHtml(pool, { worker, request, type, historyEntries }) {
  let allowanceRow = "";
  if (type.consumesAllowance) {
    const year = request.date_from.slice(0, 4);
    const remaining = await remainingAllowanceDays(pool, request.user_id, year);
    allowanceRow = `<strong>Subsidio actual:</strong> ${remaining} día${remaining === 1 ? "" : "s"}<br/>`;
  }

  return `
    <h3 style="font-size:15px;margin:24px 0 8px;color:#1a2b3c;">Solicitud</h3>
    <p style="font-size:13px;line-height:1.8;margin:0;color:#1a2b3c;">
      <strong>Empleado:</strong> ${worker.name}<br/>
      <strong>Tipo de solicitud:</strong> ${type.name}<br/>
      <strong>Periodo:</strong> ${fmtDateEs(request.date_from)} hasta ${fmtDateEs(request.date_to)}<br/>
      <strong>Solicitado:</strong> ${request.days} día(s)<br/>
      ${allowanceRow}
      <strong>Historia:</strong><br/>
      ${historyHtml(historyEntries)}
    </p>
  `;
}

async function emailShellHtml(pool, { worker, request, type, greetingName, statusLine, historyEntries, noteHtml, showCalendarButton }) {
  const infoSection = await requestInfoSectionHtml(pool, { worker, request, type, historyEntries });
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="margin-bottom:24px;">${wordmarkHtml()}</div>
      ${showCalendarButton ? calendarBoxHtml({ worker, request, type }) : ""}
      <h2 style="font-size:22px;margin:0 0 8px;color:#1a2b3c;">¡Hola ${greetingName}!</h2>
      <p style="font-size:14px;color:#1a2b3c;">${statusLine}</p>
      ${infoSection}
      ${noteHtml || ""}
      <h3 style="font-size:15px;margin:24px 0 8px;color:#1a2b3c;">Detalles</h3>
      <p style="margin:0;"><a href="${appUrl()}" style="color:#1a7f5c;font-weight:700;text-decoration:underline;">Verifica aquí</a></p>
      <p style="margin-top:32px;font-size:13px;color:#5a6b7a;">Un saludo,<br/>Sepiamary</p>
    </div>
  `;
}

export async function sendInviteEmail({ name, email, username, tempPassword }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="margin-bottom:24px;">${wordmarkHtml()}</div>
      <h2 style="font-size:22px;margin:0 0 8px;color:#1a2b3c;">¡Hola ${name}!</h2>
      <p style="font-size:14px;color:#1a2b3c;">Se ha creado tu cuenta en Sepiamary Vacaciones. Ya puedes entrar con estos datos:</p>
      <div style="border:1px solid #d7dee6;border-radius:12px;padding:16px 20px;margin:20px 0;background:#f4f7fb;">
        <p style="margin:0 0 6px;font-size:14px;color:#1a2b3c;"><strong>Usuario:</strong> ${username}</p>
        <p style="margin:0;font-size:14px;color:#1a2b3c;"><strong>Contraseña temporal:</strong> ${tempPassword}</p>
      </div>
      <p style="margin:0 0 24px;"><a href="${appUrl()}" style="display:inline-block;background:#123a5c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:13px;">Entrar a la app</a></p>
      <p style="font-size:13px;color:#5a6b7a;">Por seguridad, cambia la contraseña nada más entrar desde tu perfil (arriba a la izquierda → Cambiar contraseña).</p>
      <p style="margin-top:32px;font-size:13px;color:#5a6b7a;">Un saludo,<br/>Sepiamary</p>
    </div>
  `;
  return sendMail({ to: email, subject: "Tu cuenta en Sepiamary Vacaciones", html });
}

export async function notifyRequestCreated(pool, request, worker) {
  const type = typeInfo(request.type);
  const dept = departmentName(request.department);
  const managers = await getDepartmentManagers(pool, request.department, worker?.id);
  if (!managers.length) return;

  const historyEntries = [{ label: "Creación", at: request.requested_at, by: worker?.name || request.user_name }];

  for (const manager of managers) {
    const html = await emailShellHtml(pool, {
      worker: { name: worker?.name || request.user_name, id: request.user_id },
      request,
      type,
      greetingName: manager.name,
      statusLine: `<strong>${worker?.name || request.user_name}</strong> (${dept}) ha solicitado <strong>${type.name}</strong> y está pendiente de tu revisión.`,
      historyEntries,
      showCalendarButton: false,
    });
    await sendMail({
      to: manager.email,
      subject: `Nueva solicitud de ${type.name} de ${worker?.name || request.user_name}`,
      html,
    });
  }
}

export async function notifyRequestResolved(pool, request, worker, resolvedByName, resolvedById) {
  const type = typeInfo(request.type);
  const dept = departmentName(request.department);
  const statusText = { approved: "aprobada", rejected: "rechazada", cancelled: "cancelada" }[
    request.status
  ];
  const historyLabel = { approved: "Aprobación", rejected: "Rechazo", cancelled: "Cancelación" }[
    request.status
  ];
  const noteHtml = request.decision_note
    ? `<p style="font-size:13px;color:#1a2b3c;"><strong>Motivo:</strong> ${request.decision_note}</p>`
    : "";
  const historyEntries = [
    { label: "Creación", at: request.requested_at, by: worker?.name || request.user_name },
    { label: historyLabel, at: request.resolved_at, by: resolvedByName },
  ];
  const showCalendarButton = request.status === "approved";

  if (worker?.email) {
    const html = await emailShellHtml(pool, {
      worker,
      request,
      type,
      greetingName: worker.name,
      statusLine: `Tu solicitud ha sido <strong>${statusText}</strong>.`,
      historyEntries,
      noteHtml,
      showCalendarButton,
    });
    await sendMail({
      to: worker.email,
      subject: `Tu solicitud de ${type.name} ha sido ${statusText}`,
      html,
    });
  }

  const managers = await getDepartmentManagers(pool, request.department, resolvedById);
  for (const manager of managers) {
    const html = await emailShellHtml(pool, {
      worker: worker || { name: request.user_name, id: request.user_id },
      request,
      type,
      greetingName: manager.name,
      statusLine: `La solicitud de <strong>${worker?.name || request.user_name}</strong> (${dept}) ha sido <strong>${statusText}</strong> por ${resolvedByName}.`,
      historyEntries,
      noteHtml,
      showCalendarButton,
    });
    await sendMail({
      to: manager.email,
      subject: `Solicitud de ${type.name} de ${worker?.name || request.user_name} ${statusText}`,
      html,
    });
  }
}
