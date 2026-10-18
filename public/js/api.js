// Cliente de la API, sesión y cola sin conexión.

export const store = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

export const session = {
  get token() { return store.get('ps_token'); },
  get user() { return store.get('ps_user'); },
  get expToken() { return store.get('ps_exp'); },
  set(token, user) { store.set('ps_token', token); store.set('ps_user', user); notify(); },
  setUser(user) { store.set('ps_user', user); notify(); },
  setExp(token) { store.set('ps_exp', token); },
  clearExp() { store.del('ps_exp'); },
  clear() { store.del('ps_token'); store.del('ps_user'); notify(); },
  isCoordinator() { return ['coordinator', 'admin'].includes(this.user?.role); },
};
const listeners = new Set();
export const onSession = (fn) => listeners.add(fn);
const notify = () => listeners.forEach(fn => fn(session.user));

// Hay internet pero el servidor no responde (apagado o reiniciándose).
function serverDownMessage() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(location.hostname);
  return local
    ? 'El servidor de Puente Solidario no está encendido en esta computadora. Ábrelo con iniciar-windows.bat (Windows) o iniciar-mac.command (Mac) y pulsa Reintentar.'
    : 'No se pudo conectar con el servidor de Puente Solidario. Puede estar reiniciándose; intenta de nuevo en un momento.';
}

export async function api(path, { method = 'GET', body, exp = false, raw = false } = {}) {
  const headers = {};
  const token = exp ? session.expToken : session.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    const e = new Error(navigator.onLine ? serverDownMessage() : 'Sin conexión. Revisa tu internet e intenta de nuevo.');
    e.network = true;
    throw e;
  }
  if (raw) {
    if (!res.ok) throw Object.assign(new Error('No se pudo cargar.'), { status: res.status });
    return res;
  }
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    if (res.status === 401 && !exp && session.token) session.clear();
    const e = new Error(data.error || 'Ocurrió un error. Intenta de nuevo.');
    e.status = res.status;
    throw e;
  }
  return data;
}

// ---- Cola sin conexión: si no hay señal, la solicitud se guarda y se envía al volver internet ----
export function queueRequest(body) {
  const q = store.get('ps_queue', []);
  q.push({ body, at: Date.now() });
  store.set('ps_queue', q);
}
export const queueSize = () => store.get('ps_queue', []).length;

export async function flushQueue(onSent) {
  const q = store.get('ps_queue', []);
  if (!q.length || !navigator.onLine) return;
  const rest = [];
  for (const item of q) {
    try {
      const r = await api('/requests', { method: 'POST', body: item.body });
      saveMyCode(r.code, r.pin, item.body.community);
      onSent?.(r);
    } catch (e) {
      if (e.network) rest.push(item); // sigue sin conexión: se reintenta luego
    }
  }
  store.set('ps_queue', rest);
}

// Códigos de solicitudes creadas en este dispositivo (para no perder código y PIN).
export function saveMyCode(code, pin, community) {
  const list = store.get('ps_codes', []).filter(c => c.code !== code);
  list.unshift({ code, pin, community, at: Date.now() });
  store.set('ps_codes', list.slice(0, 10));
}
export const myCodes = () => store.get('ps_codes', []);
export const forgetCode = (code) => store.set('ps_codes', myCodes().filter(c => c.code !== code));
