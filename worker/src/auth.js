/* Sessions: a small signed token, `base64url(payload).base64url(hmac)`, kept by
   the site and sent as a Bearer header. It only says WHO you are; whether you
   are an admin is decided on every request from your current Discord roles,
   so taking a role away takes the panel away within one sync. */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const key = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signToken(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(env.SESSION_SECRET), enc.encode(body));
  return body + '.' + b64u(sig);
}
export async function verifyToken(env, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await key(env.SESSION_SECRET), unb64u(sig), enc.encode(body)).catch(() => false);
  if (!ok) return null;
  const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
  return p.exp > Date.now() ? p : null;
}

/* Discord signs every interaction (slash command) with the app's Ed25519 key. */
export async function verifyDiscord(env, req, raw) {
  const sig = req.headers.get('x-signature-ed25519'), ts = req.headers.get('x-signature-timestamp');
  if (!sig || !ts || !env.PUBLIC_KEY) return false;
  const hex = h => Uint8Array.from(h.match(/../g).map(b => parseInt(b, 16)));
  const k = await crypto.subtle.importKey('raw', hex(env.PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', k, hex(sig), enc.encode(ts + raw));
}
