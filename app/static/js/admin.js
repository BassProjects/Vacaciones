import {apiFetch} from './api.js';
import {todayISO} from './shared.js';

let employees = [];
let auditPage = 1;
const status = document.querySelector('#admin-status');
const employeeName = id => employees.find(u => u.id === id)?.name || id || 'Operación de sistema';

async function get(path) {
  const response = await apiFetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se puede completar la operación');
  return data;
}
function options(select, rows) {
  const selected = select.value;
  select.replaceChildren(...rows.map(row => {
    const option = document.createElement('option'); option.value = row.id; option.textContent = row.name;
    return option;
  }));
  if (rows.some(row => row.id === selected)) select.value = selected;
}
function entry(parent, title, body) {
  const article = document.createElement('article'); article.className = 'card';
  const heading = document.createElement('h3'); heading.textContent = title;
  const paragraph = document.createElement('p'); paragraph.textContent = body;
  article.append(heading, paragraph); parent.append(article); return article;
}
function readWorkSchedule() {
  const form = document.querySelector('#work-schedule-form');
  const user = employees.find(u => u.id === form.elements.userId.value);
  if (!user) return;
  form.elements.calendarId.value = user.calendarId;
  for (let day = 0; day < 7; day++) form.elements[`day${day}`].value = user.workHours[String(day)] || '0';
  form.elements.employedFrom.value = user.employedFrom || '';
  form.elements.employedTo.value = user.employedTo || '';
}
async function refresh() {
  const [configuration, bootstrap] = await Promise.all([get('/api/admin/configuration'), get('/api/bootstrap')]);
  employees = bootstrap.users;
  document.querySelectorAll('[data-user-select]').forEach(select => options(select, employees));
  document.querySelectorAll('[data-calendar-select]').forEach(select => options(select, configuration.calendars));
  const form = document.querySelector('#configuration-form');
  for (const name of ['defaultAllowance','overAllowance','maxAwayPercent']) form.elements[name].value = configuration[name];
  const departments = document.querySelector('#departments-list'); departments.replaceChildren();
  configuration.departments.forEach(d => entry(departments, `${d.name} (${d.id})`, `Cobertura mínima: ${d.minimumPresent} personas`));
  document.querySelector('#mail-status').textContent = configuration.mailEnabled ? 'Gmail API activada.' : 'Gmail API desactivada: no se envían correos.';
  document.querySelectorAll('[data-current-year]').forEach(input => { if (!input.value) input.value = todayISO().slice(0,4); });
  readWorkSchedule();
  status.textContent = 'Configuración cargada.';
}
document.querySelector('#work-schedule-form [name=userId]').addEventListener('change', readWorkSchedule);
document.querySelectorAll('form[data-endpoint]').forEach(form => form.addEventListener('submit', async event => {
  event.preventDefault();
  const result = form.querySelector('.result');
  const button = form.querySelector('button'); button.disabled = true; result.textContent = 'Guardando…';
  try {
    let values = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type=checkbox]').forEach(input => { values[input.name] = input.checked; });
    form.querySelectorAll('input[type=number]').forEach(input => { values[input.name] = Number(input.value); });
    form.querySelectorAll('input[type=date]').forEach(input => { if (!input.value) values[input.name] = null; });
    let endpoint = form.dataset.endpoint;
    for (const key of (form.dataset.pathFields || '').split(',').filter(Boolean)) {
      endpoint = endpoint.replace(`{${key}}`, encodeURIComponent(values[key])); delete values[key];
    }
    if (form.id === 'work-schedule-form') {
      values.workHours = {};
      for (let day = 0; day < 7; day++) {
        if (values[`day${day}`] > 0) values.workHours[String(day)] = String(values[`day${day}`]);
        delete values[`day${day}`];
      }
    }
    const response = await apiFetch(endpoint, {method:form.dataset.method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(values)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
    result.textContent = data.message || 'Guardado. La operación queda registrada.';
    await refresh();
  } catch (error) { result.textContent = error.message; }
  finally { button.disabled = false; }
}));

document.querySelector('#load-policies').addEventListener('click', async () => {
  try {
    const result = await get(`/api/admin/policies?year=${todayISO().slice(0,4)}`);
    const container = document.querySelector('#policies-list'); container.replaceChildren();
    result.policies.forEach(p => entry(container, `${employeeName(p.userId)} · ${p.year}`,
      `Concesión: ${p.entitlement}; ajuste: ${p.adjustment}; arrastre: ${p.carryover}; caducidad: ${p.carryoverExpiry || 'fin de año'}; prorrateo: ${p.prorate ? 'sí' : 'no'}`));
    if (!result.policies.length) entry(container, 'Sin concesiones fijadas', 'Se usará la política general al registrar solicitudes.');
  } catch (error) { status.textContent = error.message; }
});
document.querySelector('#load-delegations').addEventListener('click', async () => {
  try {
    const data = await get('/api/admin/delegations');
    const container = document.querySelector('#delegations-list'); container.replaceChildren();
    data.delegations.forEach(d => {
      const article = entry(container, `${employeeName(d.managerId)} → ${employeeName(d.delegateId)}`, `${d.dateFrom} – ${d.dateTo}`);
      const button = document.createElement('button'); button.className = 'btn btn-outline'; button.textContent = 'Revocar delegación';
      button.addEventListener('click', async () => {
        if (!window.confirm('¿Revocar esta delegación?')) return;
        const response = await apiFetch(`/api/admin/delegations/${encodeURIComponent(d.id)}`, {method:'DELETE'});
        if (response.ok) article.remove(); else status.textContent = (await response.json()).error;
      }); article.append(button);
    });
  } catch (error) { status.textContent = error.message; }
});
document.querySelector('#load-outbox').addEventListener('click', async () => {
  try {
    const data = await get('/api/admin/outbox');
    const container = document.querySelector('#outbox-list'); container.replaceChildren();
    data.messages.forEach(m => {
      const article = entry(container, `${m.recipient} · ${m.status}`, `${m.subject}; intentos: ${m.attempts}; ${m.lastError || ''}`);
      if (['failed','uncertain'].includes(m.status)) {
        const button = document.createElement('button'); button.className = 'btn btn-outline'; button.textContent = 'Solicitar reintento';
        button.addEventListener('click', async () => {
          const uncertain = m.status === 'uncertain';
          if (uncertain && !window.confirm('La entrega anterior es incierta. Podría enviarse un duplicado. ¿Continuar?')) return;
          const response = await apiFetch(`/api/admin/outbox/${encodeURIComponent(m.id)}/retry`, {method:'POST',
            headers:{'Content-Type':'application/json'}, body:JSON.stringify({acknowledgePossibleDuplicate:uncertain})});
          if (response.ok) { button.disabled = true; button.textContent = 'Pendiente de la tarea de envío'; }
          else status.textContent = (await response.json()).error;
        }); article.append(button);
      }
    });
  } catch (error) { status.textContent = error.message; }
});
document.querySelector('#load-audit').addEventListener('click', async () => {
  try {
    const data = await get(`/api/admin/audit?page=${auditPage}`);
    const container = document.querySelector('#audit-list');
    data.events.forEach(e => entry(container, `${e.action} · ${employeeName(e.actorId)}`,
      `${e.at} · ${e.entityId} · ${JSON.stringify(e.details)}`));
    auditPage += 1;
    if ((auditPage-1)*100 >= data.total) document.querySelector('#load-audit').disabled = true;
  } catch (error) { status.textContent = error.message; }
});
refresh().catch(error => { status.textContent = error.message; });
