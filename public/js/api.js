const KEY = 'cadarvis.token';

export const session = {
  get token() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(KEY, t); } catch {} },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
};

export async function api(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Sin conexión con el servidor');
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    session.clear();
    location.hash = '#/login';
    throw new Error('Su sesión venció, entre de nuevo');
  }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}
