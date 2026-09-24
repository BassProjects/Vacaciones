import { apiFetch } from './api.js';

export function invitationMailText(row) {
  const status = row.mailStatus || (row.mailSent ? 'sent' : row.mailQueued ? 'pending' : 'not_queued');
  if (status === 'sent') return 'Correo enviado (aceptado por el servidor)';
  if (status === 'sending') return 'Enviando correo';
  if (status === 'pending') return 'Pendiente de envío · revisión automática cada minuto';
  if (status === 'uncertain') return 'Envío sin confirmar · revisar la bandeja de salida antes de reenviar';
  if (status === 'failed') {
    const reasons = {
      SMTP_AUTH_REJECTED: 'Google ha rechazado el acceso al buzón de envío',
      SMTP_RECIPIENT_REJECTED: 'el servidor ha rechazado el destinatario',
      SMTP_CONNECTION_FAILED: 'no se ha podido conectar con el servidor de correo',
      SMTP_TLS_REJECTED: 'no se ha podido verificar la conexión segura',
    };
    return 'Correo no enviado: ' + (reasons[row.mailError] || 'revisa la bandeja de salida');
  }
  if (status === 'not_queued') return 'Sin invitación por correo; la cuenta ya existía';
  return 'Estado del correo no disponible';
}

export async function refreshInvitationDelivery(APP, runtime, render) {
  const modal = APP.modal;
  const administratorId = APP.me?.id;
  if (APP.view !== 'app' || APP.me?.role !== 'admin' ||
      modal?.type !== 'inviteWorkers' || modal.step !== 'result' || runtime.invitationStatusLoading) return;
  const rows = [...(modal.results.created || []), ...(modal.results.existing || [])];
  const ids = [...new Set(rows.filter(row => row.mailId &&
    ['pending', 'sending'].includes(row.mailStatus)).map(row => row.mailId))];
  if (!ids.length) return;
  runtime.invitationStatusLoading = true;
  const stillCurrent = () => APP.modal === modal && APP.view === 'app' &&
    APP.me?.role === 'admin' && APP.me?.id === administratorId;
  try {
    const response = await apiFetch('/api/users/invitation-status?ids=' + encodeURIComponent(ids.join(',')));
    if (!response.ok) throw new Error('No se pudo consultar el estado del envío');
    const data = await response.json();
    if (!stillCurrent()) return;
    const states = new Map(data.messages.map(message => [message.mailId, message]));
    let changed = Boolean(modal.deliveryRefreshError);
    for (const row of rows) {
      const state = states.get(row.mailId);
      if (state && (state.mailStatus !== row.mailStatus || state.mailError !== row.mailError)) {
        Object.assign(row, state);
        changed = true;
      }
    }
    modal.deliveryRefreshError = '';
    if (changed) render();
  } catch (error) {
    if (stillCurrent()) {
      modal.deliveryRefreshError = 'No se ha podido actualizar el estado. Se volverá a consultar automáticamente; no se reenviará el correo.';
      render();
    }
  } finally {
    runtime.invitationStatusLoading = false;
  }
}
