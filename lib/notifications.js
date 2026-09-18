import { sendMail } from "./mailer";
import { ABSENCE_TYPES, DEPARTMENTS } from "./constants";

function typeName(typeId) {
  return ABSENCE_TYPES.find((t) => t.id === typeId)?.name || typeId;
}

function departmentName(deptId) {
  return DEPARTMENTS.find((d) => d.id === deptId)?.name || deptId;
}

function fmtDateEs(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
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

function baseFooter() {
  return `<p>Un saludo,<br/>Sepiamary</p>`;
}

export async function notifyRequestCreated(pool, request, worker) {
  const type = typeName(request.type);
  const dept = departmentName(request.department);
  const dateRange = `${fmtDateEs(request.date_from)} al ${fmtDateEs(request.date_to)}`;

  if (worker?.email) {
    await sendMail({
      to: worker.email,
      subject: `Solicitud de ${type} registrada`,
      html: `
        <p>Hola ${worker.name},</p>
        <p>Hemos registrado tu solicitud de <strong>${type}</strong> del ${dateRange} (${request.days} día(s)). Queda pendiente de aprobación.</p>
        ${baseFooter()}
      `,
    });
  }

  const managers = await getDepartmentManagers(pool, request.department, worker?.id);
  for (const manager of managers) {
    await sendMail({
      to: manager.email,
      subject: `Nueva solicitud de ${type} de ${worker?.name || request.user_name}`,
      html: `
        <p>Hola ${manager.name},</p>
        <p><strong>${worker?.name || request.user_name}</strong> (${dept}) ha solicitado <strong>${type}</strong> del ${dateRange} (${request.days} día(s)) y está pendiente de tu revisión.</p>
        ${baseFooter()}
      `,
    });
  }
}

export async function notifyRequestResolved(pool, request, worker, resolvedByName, resolvedById) {
  const type = typeName(request.type);
  const dept = departmentName(request.department);
  const dateRange = `${fmtDateEs(request.date_from)} al ${fmtDateEs(request.date_to)}`;
  const statusText = { approved: "aprobada", rejected: "rechazada", cancelled: "cancelada" }[
    request.status
  ];
  const noteHtml = request.decision_note ? `<p>Motivo: ${request.decision_note}</p>` : "";

  if (worker?.email) {
    await sendMail({
      to: worker.email,
      subject: `Tu solicitud de ${type} ha sido ${statusText}`,
      html: `
        <p>Hola ${worker.name},</p>
        <p>Tu solicitud de <strong>${type}</strong> del ${dateRange} ha sido <strong>${statusText}</strong> por ${resolvedByName}.</p>
        ${noteHtml}
        ${baseFooter()}
      `,
    });
  }

  const managers = await getDepartmentManagers(pool, request.department, resolvedById);
  for (const manager of managers) {
    await sendMail({
      to: manager.email,
      subject: `Solicitud de ${type} de ${worker?.name || request.user_name} ${statusText}`,
      html: `
        <p>Hola ${manager.name},</p>
        <p>La solicitud de <strong>${type}</strong> de <strong>${worker?.name || request.user_name}</strong> (${dept}) del ${dateRange} ha sido <strong>${statusText}</strong> por ${resolvedByName}.</p>
        ${noteHtml}
        ${baseFooter()}
      `,
    });
  }
}
