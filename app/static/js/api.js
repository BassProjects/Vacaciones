export async function apiFetch(path, options = {}) {
  const destination = new URL(path, window.location.origin);
  if (destination.origin !== window.location.origin) throw new Error('Destino de API no autorizado');
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('X-Request-ID', crypto.randomUUID());
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const cookie = document.cookie.split('; ').find(value => value.startsWith('vac_csrf_v2='));
    headers.set('X-CSRF-Token', cookie ? decodeURIComponent(cookie.split('=')[1]) : '');
  }
  return window.fetch(destination.href, {...options, method, headers,
    credentials:'same-origin', cache:'no-store',
    signal: options.signal || AbortSignal.timeout(20000)});
}
