import { apiFetch } from './api.js';

const form = document.querySelector('#activation-form');
const status = document.querySelector('#activation-status');
const error = document.querySelector('#activation-error');
const success = document.querySelector('#activation-success');
let token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
// Keep the bearer token only in memory, not in history, storage or request URLs.
window.history.replaceState(null, '', window.location.pathname);
let sending = false;

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

async function inspect() {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    status.textContent = 'Necesitas el enlace personal de tu correo de invitación.';
    showError('Abre el enlace de activación del correo. Si ha caducado, solicita otro a administración.');
    return;
  }
  try {
    const response = await apiFetch('/api/activation/inspect', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se ha podido comprobar la invitación.');
    form.elements.name.value = data.name;
    document.querySelector('#activation-email').value = data.email;
    document.querySelector('#activation-username').value = data.username;
    status.textContent = 'Completa los campos obligatorios (*) para empezar a utilizar Vacaciones.';
    form.hidden = false;
  } catch (failure) {
    status.textContent = 'No se ha podido abrir el registro.';
    showError(failure.message || 'No se ha podido comprobar la invitación. Abre de nuevo el enlace.');
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  const fields = new FormData(form);
  error.hidden = true;
  if (!String(fields.get('name')).trim()) {
    showError('Completa tu nombre y apellidos.'); return;
  }
  if (fields.get('newPassword') !== fields.get('confirmPassword')) {
    showError('Las contraseñas no coinciden.'); return;
  }
  sending = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Activando cuenta…';
  try {
    const response = await apiFetch('/api/activation/complete', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token, name: fields.get('name'), birthDate: fields.get('birthDate'),
        newPassword: fields.get('newPassword'), confirmPassword: fields.get('confirmPassword'),
        shareBirthday: fields.get('shareBirthday') === 'on'}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Revisa el nombre, la fecha de nacimiento y las contraseñas.');
    token = '';
    form.reset();
    form.hidden = true;
    status.textContent = 'Registro completado.';
    success.textContent = `Tu cuenta está activada. Inicia sesión con el usuario ${data.username} y la contraseña que acabas de crear.`;
    success.hidden = false;
  } catch (failure) {
    showError(failure.message || 'No se pudo confirmar el registro. Si ya se completó, prueba a iniciar sesión.');
  } finally {
    sending = false;
    button.disabled = false;
    button.textContent = 'Crear contraseña y activar cuenta';
  }
});
inspect();
