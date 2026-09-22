import { apiFetch } from './api.js';
import { STATUS_BADGE_CLASS, STATUS_LABELS, avatarHtml, computeAllowance, esc, fmtBytes, fmtDate, fmtDateTime, fmtDays, historyIconSvg, infoIconSvg, paperclipIconSvg } from './shared.js';
import { enumerateWorkDays } from './dates.js';
export function createFeature(ctx) {
  const {APP, root, runtime} = ctx;
  function canUploadAttachment(request) {
    return request.private && request.type === 'baja';
  }

  function canCancelRequest(request) {
    return request.status === 'approved' && request.canApprove;
  }

  function renderAttachmentsBody(request, ctx) {
    const items = ctx.attachments || [];
    const listHtml = items.length
      ? items
          .map(
            (a) => `
        <a class="attachment-row" href="/api/requests/${esc(request.id)}/attachments/${esc(
              a.id
            )}" target="_blank" rel="noopener" data-action="open-attachment-popup" data-url="/api/requests/${esc(
              request.id
            )}/attachments/${esc(a.id)}">
          <span class="attachment-icon">${a.mimeType.startsWith("image/") ? "🖼️" : "📄"}</span>
          <div class="attachment-info">
            <div class="attachment-name">${esc(a.filename)}</div>
            <div class="faint">${fmtBytes(a.sizeBytes)} · ${esc(a.uploadedBy)} · ${fmtDateTime(a.uploadedAt)}</div>
          </div>
        </a>
      `
          )
          .join("")
      : `<div class="empty-state">No se ha adjuntado todavía ningún anexo a la solicitud.</div>`;

    const uploadHtml = canUploadAttachment(request)
      ? `
      <form data-action="upload-attachment-form" data-request-id="${esc(request.id)}" class="attachment-upload-form">
        <input type="file" name="file" accept="image/*,application/pdf" required />
        <button type="submit" class="btn btn-outline btn-sm" ${ctx.uploading ? "disabled" : ""}>${
          ctx.uploading ? "Subiendo…" : "Adjuntar justificante"
        }</button>
      </form>
      ${ctx.attachError ? `<div class="form-error">${esc(ctx.attachError)}</div>` : ""}
    `
      : "";

    return `
      <div class="attachment-list">${
        ctx.attachLoading ? `<div class="empty-state">Cargando…</div>` : listHtml
      }</div>
      ${uploadHtml}
    `;
  }

  function usersOnDay(iso, deptFilter) {
    return APP.requests
      .filter(
        (r) =>
          r.status === "approved" &&
          r.dateFrom <= iso &&
          r.dateTo >= iso &&
          (!deptFilter || r.department === deptFilter)
      )
      .map((r) => {
        const rosterUser = APP.roster.find((u) => u.id === r.userId);
        return {
          id: r.userId,
          name: r.userName,
          department: r.department,
          avatarUrl: rosterUser?.avatarUrl,
          dateFrom: r.dateFrom,
          dateTo: r.dateTo,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function buildOverlapScope(days, deptFilter) {
    const byDay = days.map((iso) => ({ date: iso, users: usersOnDay(iso, deptFilter) }));
    const byId = new Map();
    byDay.forEach((d) => d.users.forEach((u) => byId.set(u.id, u)));
    return { list: [...byId.values()], byDay };
  }

  function computeOverlapping(request) {
    const holidaysSet = new Set(APP.holidays.map((h) => h.date));
    const days = enumerateWorkDays(request.dateFrom, request.dateTo, holidaysSet);
    const deptScope = buildOverlapScope(days, request.department);
    const allScope = buildOverlapScope(days, null);
    return {
      days,
      all: allScope.list,
      sameDept: deptScope.list,
      byDayAll: allScope.byDay,
      byDayDept: deptScope.byDay,
    };
  }

  function renderOverlapAvatars(list) {
    const shown = list.slice(0, 5);
    const extra = list.length - shown.length;
    const avatars = shown.map((u) => avatarHtml(u, 26)).join("");
    const extraHtml = extra > 0 ? `<span class="overlap-extra">+${extra}</span>` : "";
    return `<div class="overlap-avatars">${avatars}${extraHtml}</div>`;
  }

  function renderOverlapSparkline(byDay) {
    const max = Math.max(1, ...byDay.map((d) => d.users.length));
    const bars = byDay
      .map((d) => {
        const pct = Math.max(8, Math.round((d.users.length / max) * 100));
        const cls = d.users.length > 0 ? "overlap-bar-fill" : "overlap-bar-fill empty";
        return `<div class="overlap-bar"><div class="${cls}" style="height:${pct}%"></div></div>`;
      })
      .join("");
    return `<div class="overlap-sparkline">${bars}</div>`;
  }

  function renderOverlapRow(label, list, byDay, requestId, scope) {
    return `
      <div class="overlap-row" data-action="open-overlap-modal" data-id="${esc(requestId)}" data-scope="${esc(
      scope
    )}">
        <div class="overlap-row-label">${esc(label)}</div>
        <div class="overlap-row-right">
          ${renderOverlapSparkline(byDay)}
          ${renderOverlapAvatars(list)}
        </div>
      </div>
    `;
  }

  function renderDetailInfo(request) {
    const type = APP.absenceTypes.find((t) => t.id === request.type);
    const overlap = computeOverlapping(request);
    const rosterApprover = APP.roster.find((u) => u.name === request.resolvedBy);
    const deptName = APP.departments.find((d) => d.id === request.department)?.name || request.department;

    let allowanceHtml = "";
    if (type && type.consumesAllowance) {
      const fullUser = APP.users.find((u) => u.id === request.userId);
      const pseudoUser = {
        id: request.userId,
        allowanceOverride: fullUser ? fullUser.allowanceOverride : null,
      };
      const year = request.dateFrom.slice(0, 4);
      const info = computeAllowance(pseudoUser, APP.requests, year, APP.config.defaultAllowance);
      const pct = info.allowance > 0 ? Math.min(100, Math.round((info.remaining / info.allowance) * 100)) : 0;
      allowanceHtml = `
        <div class="detail-field">
          <div class="detail-field-label">RESTANTE</div>
          <div class="detail-field-value">${fmtDays(info.remaining)} día${
        fmtDays(info.remaining) === "1" ? "" : "s"
      }</div>
          <div class="detail-progress-track"><div class="detail-progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }

    return `
      <div class="detail-field">
        <div class="detail-field-label">FECHA</div>
        <div class="detail-field-value">${fmtDate(request.dateFrom)} - ${fmtDate(request.dateTo)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">SOLICITADO</div>
        <div class="detail-field-value">${fmtDays(request.days)} día${
      fmtDays(request.days) === "1" ? "" : "s"
    }</div>
      </div>
      ${allowanceHtml}
      <div class="detail-field">
        <div class="detail-field-label">APROBACIÓN</div>
        <div class="detail-approval-row">
          ${avatarHtml(rosterApprover || { name: request.resolvedBy || "—" }, 30)}
          <span>${esc(request.resolvedBy || "—")}</span>
        </div>
      </div>
      <div class="detail-overlap-section">
        <div class="section-title">Ausente al mismo tiempo</div>
        ${renderOverlapRow(deptName, overlap.sameDept, overlap.byDayDept, request.id, "dept")}
        ${renderOverlapRow("Toda la organización", overlap.all, overlap.byDayAll, request.id, "all")}
      </div>
      ${
        canCancelRequest(request)
          ? `
        <button type="button" class="btn btn-danger btn-block detail-cancel-btn" data-action="open-cancel-modal" data-id="${esc(
          request.id
        )}">Cancelar solicitud</button>
      `
          : ""
      }
    `;
  }

  function renderDetailHistory(request) {
    if (!request.private) return '<p>Los detalles de esta ausencia son privados.</p>';
    const events = request.history || [];
    const labels = {'request.created':'Solicitud creada', 'request.approve':'Aprobación',
      'request.reject':'Rechazo', 'request.cancel':'Cancelación', 'request.withdraw':'Retirada',
      'request.imported':'Importación de histórico', 'attachment.uploaded':'Justificante adjuntado',
      'attachment.downloaded':'Consulta de justificante'};
    return `<h2 class="section-title">Historial completo</h2>${events.length ? events.map(e => {
      const actor = APP.roster.find(u => u.id === e.actorId);
      return `<article class="history-row"><div><strong>${esc(labels[e.action] || e.action)}</strong>
      <p>${fmtDateTime(e.at)} · ${esc(actor?.name || 'Administración / histórico')}</p>
      ${e.details?.reason ? `<p>${esc(e.details.reason)}</p>` : ''}</div></article>`;
    }).join('') : '<p>Cargando el historial…</p>'}`;
  }

  function renderDetailAttachments(request, dp) {
    return `<div class="section-title">Adjuntos</div>${renderAttachmentsBody(request, dp)}`;
  }

  function renderDetailPanel() {
    const dp = APP.detailPanel;
    const request = APP.requests.find((r) => r.id === dp.requestId);
    if (!request) return "";
    if (!request.private) return `<aside class="detail-panel"><button class="btn btn-outline" data-action="close-detail-panel">Cerrar</button><h2>${esc(request.userName)}</h2><p>Ausente: ${fmtDate(request.dateFrom)} – ${fmtDate(request.dateTo)}</p><p>Los detalles de esta ausencia son privados.</p></aside>`;
    const type = APP.absenceTypes.find((t) => t.id === request.type);
    const rosterUser = APP.roster.find((u) => u.id === request.userId);

    const tabs = [
      { id: "info", icon: infoIconSvg(), label: "Información" },
      {
        id: "adjuntos",
        icon: paperclipIconSvg(),
        label: "Adjuntos",
        count: dp.attachments ? dp.attachments.length : 0,
      },
      { id: "historial", icon: historyIconSvg(), label: "Historial" },
    ];
    const tabsHtml = tabs
      .map(
        (t) => `
        <button type="button" class="detail-tab-btn ${dp.tab === t.id ? "active" : ""}" data-action="switch-detail-tab" data-tab="${t.id}" title="${esc(
          t.label
        )}">
          ${t.icon}
          ${t.count != null ? `<span class="detail-tab-count">${t.count}</span>` : ""}
        </button>
      `
      )
      .join("");

    let body = "";
    if (dp.tab === "adjuntos") body = renderDetailAttachments(request, dp);
    else if (dp.tab === "historial") body = renderDetailHistory(request);
    else body = renderDetailInfo(request);

    return `
      <div class="detail-panel-overlay">
        <div class="detail-panel">
          <div class="detail-panel-topbar">
            <button type="button" class="detail-close-btn" data-action="close-detail-panel">✕</button>
          </div>
          <div class="detail-panel-header">
            ${avatarHtml(rosterUser || { name: request.userName }, 56)}
            <div class="detail-panel-headinfo">
              <span class="badge ${STATUS_BADGE_CLASS[request.status]}">${STATUS_LABELS[
      request.status
    ].toUpperCase()}</span>
              <div class="detail-panel-name">${esc(request.userName)}</div>
              <div class="detail-panel-type">${esc(type ? type.name : request.type)}</div>
            </div>
          </div>
          <div class="detail-panel-body-wrap">
            <div class="detail-tab-rail">${tabsHtml}</div>
            <div class="detail-panel-body">${body}</div>
          </div>
        </div>
      </div>
    `;
  }

  function deptPillHtml(deptId) {
    const dept = APP.departments.find((d) => d.id === deptId);
    if (!dept) return `<span class="dept-pill">${esc(deptId || "—")}</span>`;
    return `<span class="dept-pill" style="background:${dept.color}22;color:${dept.color};border-color:${dept.color}55"><span class="dept-dot" style="background:${dept.color}"></span>${esc(
      dept.name
    )}</span>`;
  }

  function typeName(typeId) {
    const t = APP.absenceTypes.find((x) => x.id === typeId);
    return t ? t.name : typeId;
  }
  return {canUploadAttachment, canCancelRequest, renderAttachmentsBody, usersOnDay, buildOverlapScope, computeOverlapping, renderOverlapAvatars, renderOverlapSparkline, renderOverlapRow, renderDetailInfo, renderDetailHistory, renderDetailAttachments, renderDetailPanel, deptPillHtml, typeName};
}
