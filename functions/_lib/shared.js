export const PLAN_BY_ID = {
  'P-4VK74641CF049613NNKBXX5Q': { name: 'Personal', limit: 25 },
  'P-3XX127125D482264LNKBXYRQ': { name: 'Standard', limit: 100 },
  'P-6DG65191VW6148735NKBXZCA': { name: 'Business', limit: 300 },
  'P-3WD55804J4015973VNKBXZOI': { name: 'Corporate', limit: 1000 }
};

const ACTIVE_STATUSES = new Set(['ACTIVE']);

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export function badRequest(message, status = 400) {
  return json({ error: message }, status);
}

export function getDb(env) {
  if (!env.QR_DB) throw new Error('Missing QR_DB D1 binding');
  return env.QR_DB;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(String(status || '').toUpperCase());
}

export function toPlan(planId) {
  return PLAN_BY_ID[planId] || { name: 'Unknown', limit: 0 };
}

export function randomId(prefix = '') {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}${value}`;
}

export function isUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function safeShortCode(value) {
  const code = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{4,48}$/.test(code)) return '';
  return code;
}

function base64UrlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function hmac(env, value) {
  if (!env.SESSION_SECRET) throw new Error('Missing SESSION_SECRET secret');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function signSession(env, payload) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  };
  const encoded = base64UrlEncode(JSON.stringify(body));
  const signature = await hmac(env, encoded);
  return `${encoded}.${signature}`;
}

export async function verifySession(env, token) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return null;
  const expected = await hmac(env, encoded);
  if (signature !== expected) return null;
  const payload = JSON.parse(base64UrlDecode(encoded));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function requireSession(context) {
  const header = context.request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = await verifySession(context.env, token);
  if (!session || !session.userId || !session.email) return null;
  return session;
}

export async function getActiveSubscription(db, userId) {
  return db.prepare(
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND status = 'ACTIVE'
     ORDER BY qr_limit DESC, updated_at DESC
     LIMIT 1`
  ).bind(userId).first();
}
