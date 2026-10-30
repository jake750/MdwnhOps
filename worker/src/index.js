/* ==========================================================================
   غرفة العمليات — the Worker. The only thing that talks to Discord and to the
   database; the site (GitHub Pages) only ever talks to this.

     /auth/*          Discord login → a session token handed back to the site
     /api/*           the panel's data, gated per request by Discord roles
     /interactions    the /اقتراح slash command
     cron             sync.js, every 5 minutes

   Admins: anyone holding a role picked in الإعدادات, or — so the very first
   login can pick them — anyone whose roles carry Administrator or Manage
   Server. Everybody else in the server is a member: suggestions only.
   ========================================================================== */
import { discord, PERM, permsOf, avatarUrl, displayName } from './discord.js';
import { signToken, verifyToken, verifyDiscord } from './auth.js';
import { syncAll } from './sync.js';
import { uid, getSetting, setSetting, parseRow } from './db.js';
import { DEMO_USERS } from './demo.js';

const DAY = 864e5;
const PT_LABEL = { stars: '⭐ النجوم', tilawa: '📖 التلاوة', train: '🎓 التدريب', init: '💡 المبادرات', adjust: '✏️ تعديل يدوي' };
const KIND_LABEL = { event: 'فعالية', meeting: 'اجتماع', radio: 'جلسة إذاعية', reading: 'جلسة قرائية', due: 'موعد تسليم' };
/* What the panel may post where; the channel for each is picked in الإعدادات. */
const POST_KEYS = ['supervision', 'ideas', 'points', 'schedule', 'ready'];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === '/auth/login') return login(req, env, url);
      if (url.pathname === '/auth/callback') return callback(req, env, url);
      if (url.pathname === '/auth/demo' && env.DEMO === '1') return demoLogin(env, url);
      if (url.pathname === '/interactions' && req.method === 'POST') return interactions(req, env);
      if (url.pathname.startsWith('/api/')) {
        const res = await api(req, env, url, ctx);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      }
      return new Response('غرفة العمليات', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    } catch (e) {
      console.error(e);
      return json({ error: e.message || 'error' }, e.status && e.status < 500 ? e.status : 500, cors);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncAll(env));
  }
};

/* ------------------------------------------------------------------ http -- */
const json = (v, status = 200, headers = {}) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const fail = (status, msg) => { const e = new Error(msg); e.status = status; throw e; };
function corsFor(req, env) {
  const origin = req.headers.get('origin') || '';
  const site = new URL(env.SITE_URL).origin;
  const ok = origin === site || (env.DEMO === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return ok ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type',
                'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE', vary: 'origin' } : {};
}

/* ------------------------------------------------------------------ auth -- */
function login(req, env, url) {
  const state = uid() + uid();
  const redirect = url.origin + '/auth/callback';
  const to = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: env.CLIENT_ID, response_type: 'code', scope: 'identify', redirect_uri: redirect, state, prompt: 'none'
  });
  return new Response(null, { status: 302, headers: {
    location: to, 'set-cookie': 'st=' + state + '; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
  } });
}
async function callback(req, env, url) {
  const state = (req.headers.get('cookie') || '').match(/(?:^|;\s*)st=([^;]+)/);
  const back = env.SITE_URL;
  if (!state || state[1] !== url.searchParams.get('state')) return Response.redirect(back + '#error=state', 302);
  const user = await discord(env).oauthUser(url.searchParams.get('code'), url.origin + '/auth/callback');
  return finishLogin(env, user, back);
}
async function demoLogin(env, url) {
  const id = DEMO_USERS[url.searchParams.get('as')] || DEMO_USERS.member;
  const m = await discord(env).member(id);
  const back = /^http:\/\/(localhost|127\.0\.0\.1)/.test(url.searchParams.get('back') || '') ? url.searchParams.get('back') : env.SITE_URL;
  return finishLogin(env, m.user, back);
}
async function finishLogin(env, user, back) {
  const m = await discord(env).member(user.id);
  if (!m) return Response.redirect(back + '#error=not_member', 302);
  // Store them right away so a first login works before the next sync.
  await env.DB.prepare(
    `INSERT INTO members (id, username, name, avatar, roles, joined_at, in_server, synced_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)
     ON CONFLICT(id) DO UPDATE SET username=?2, name=?3, avatar=?4, roles=?5, in_server=1, left_at=NULL`
  ).bind(user.id, user.username, displayName(user, m), avatarUrl(user, m, env.GUILD_ID), JSON.stringify(m.roles || []),
         Date.parse(m.joined_at) || null, Date.now()).run();
  const hasRoles = await env.DB.prepare("SELECT 1 FROM sync_state WHERE key='guild_roles'").first();
  if (!hasRoles) {
    const g = await discord(env).guild();
    await env.DB.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)')
      .bind('guild_roles', JSON.stringify(g.roles.map(r => ({ id: r.id, name: r.name, permissions: r.permissions, color: r.color || 0, position: r.position })))).run();
  }
  const token = await signToken(env, { sub: user.id, exp: Date.now() + 14 * DAY });
  return Response.redirect(back + '#token=' + token, 302);
}

async function who(req, env) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const p = await verifyToken(env, t);
  if (!p) fail(401, 'سجّل الدخول');
  const m = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(p.sub).first();
  if (!m || !m.in_server) fail(403, 'لست في السيرفر');
  const roles = JSON.parse(m.roles || '[]');
  const adminRoles = (await getSetting(env, 'admin_roles')) || [];
  const gr = await env.DB.prepare("SELECT value FROM sync_state WHERE key='guild_roles'").first();
  const perms = permsOf(roles, gr ? JSON.parse(gr.value) : [], env.GUILD_ID);
  const admin = roles.some(r => adminRoles.includes(r)) || !!(perms & (PERM.ADMINISTRATOR | PERM.MANAGE_GUILD));
  return { id: m.id, name: m.name, avatar: m.avatar, admin };
}

/* ------------------------------------------------------------------- api -- */
async function api(req, env, url, ctx) {
  const me = await who(req, env);
  const path = url.pathname.slice(5).split('/').filter(Boolean);   // after /api/
  const [res, id, sub, subId] = path;
  const m = req.method;
  const body = () => req.json().catch(() => ({}));
  const admin = () => { if (!me.admin) fail(403, 'للإدارة فقط'); };
  const DB = env.DB;

  if (res === 'me') return json(me);
  if (res === 'boot') return json(await boot(env, me));

  /* المقترحات — members post and see their own; admins see and answer all. */
  if (res === 'ideas') {
    if (m === 'POST' && !id) {
      const b = await body();
      const text = String(b.text || '').trim().slice(0, 1200);
      if (!text) fail(400, 'اكتب المقترح');
      const row = { id: uid(), text, kind: b.kind === 'note' ? 'note' : 'idea', anon: b.anon ? 1 : 0, by_id: me.id, at: Date.now() };
      await DB.prepare('INSERT INTO ideas (id, text, kind, anon, by_id, at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, row.text, row.kind, row.anon, row.by_id, row.at).run();
      ctx.waitUntil(post(env, 'ideas', '**' + (row.kind === 'note' ? 'ملاحظة' : 'اقتراح') + ' جديد** — ' + (row.anon ? 'بدون اسم' : me.name) + '\n' + text));
      return json(row);
    }
    admin();
    if (m === 'PATCH') {
      const b = await body();
      const cur = await DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first() || fail(404, 'غير موجود');
      const reply = b.reply !== undefined ? (String(b.reply).trim().slice(0, 600) || null) : cur.reply;
      const status = ['new', 'study', 'ok', 'no'].includes(b.status) ? b.status : (reply && cur.status === 'new' ? 'study' : cur.status);
      await DB.prepare('UPDATE ideas SET status=?, reply=?, reply_by=? WHERE id=?')
        .bind(status, reply, reply ? (b.reply !== undefined ? me.id : cur.reply_by) : null, id).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') { await DB.prepare('DELETE FROM ideas WHERE id = ?').bind(id).run(); return json({ ok: true }); }
  }

  admin();   // everything below is the admins'

  /* المخطط */
  if (res === 'events') {
    if (m === 'POST' && !id) {
      const e = eventIn(await body());
      e.id = uid();
      await DB.prepare(`INSERT INTO events (id, title, kind, at, end_at, place, note, sups, tasks, created_by, created_at, updated_by, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(e.id, e.title, e.kind, e.at, e.end_at, e.place, e.note, JSON.stringify(e.sups), JSON.stringify(e.tasks), me.id, Date.now(), me.id, Date.now()).run();
      return json({ id: e.id });
    }
    if (m === 'PATCH' && sub === 'tasks') {
      const row = await DB.prepare('SELECT tasks FROM events WHERE id = ?').bind(id).first() || fail(404, 'غير موجود');
      const tasks = JSON.parse(row.tasks || '{}');
      if (!tasks[subId]) fail(404, 'غير موجود');
      const b = await body();
      tasks[subId].done = !!b.done; tasks[subId].doneBy = b.done ? me.id : null;
      await DB.prepare('UPDATE events SET tasks=?, updated_by=?, updated_at=? WHERE id=?').bind(JSON.stringify(tasks), me.id, Date.now(), id).run();
      return json({ ok: true });
    }
    if (m === 'PATCH') {
      const e = eventIn(await body());
      await DB.prepare('UPDATE events SET title=?, kind=?, at=?, end_at=?, place=?, note=?, sups=?, tasks=?, updated_by=?, updated_at=? WHERE id=?')
        .bind(e.title, e.kind, e.at, e.end_at, e.place, e.note, JSON.stringify(e.sups), JSON.stringify(e.tasks), me.id, Date.now(), id).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') { await DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run(); return json({ ok: true }); }
    if (m === 'POST' && sub === 'send') {
      const e = parseRow(await DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first(), ['sups', 'tasks']) || fail(404, 'غير موجود');
      const names = await nameMap(env);
      const lines = ['**' + (KIND_LABEL[e.kind] || '') + ': ' + e.title + '**', '🗓️ ' + fmtDate(e.at) + (e.place ? ' · ' + e.place : '')];
      const sups = Object.keys(e.sups || {});
      if (sups.length) lines.push('👤 ' + sups.map(s => (names.get(s) || s) + (e.sups[s] !== true ? ' (' + e.sups[s] + ')' : '')).join('، '));
      Object.values(e.tasks || {}).forEach(t => lines.push((t.done ? '✅ ' : '▫️ ') + t.text + (t.who ? ' — ' + (names.get(t.who) || '') : '')));
      if (e.note) lines.push('📝 ' + e.note);
      return json({ ok: await post(env, 'supervision', lines.join('\n')) });
    }
  }

  /* النقاط — server points only, in this database. */
  if (res === 'points') {
    if (m === 'GET' && id === 'history') {
      const member = url.searchParams.get('member');
      const { results } = await DB.prepare('SELECT * FROM points ' + (member ? 'WHERE member_id = ? ' : '') + 'ORDER BY at DESC LIMIT 200')
        .bind(...(member ? [member] : [])).all();
      return json(results);
    }
    if (m === 'POST' && !id) {
      const b = await body();
      const members = [...new Set((b.members || []).map(String))].slice(0, 100);
      const kind = PT_LABEL[b.kind] && b.kind !== 'adjust' ? b.kind : fail(400, 'نوع غير معروف');
      const amount = Math.trunc(Number(b.amount));
      if (!members.length || !(amount > 0 && amount <= 500)) fail(400, 'اختر الأعضاء والعدد');
      return json(await givePoints(env, ctx, me, members, amount, kind, String(b.note || '').trim().slice(0, 140) || null));
    }
    if (m === 'POST' && id === 'adjust') {
      // تعديل يدوي: a signed correction with a reason, for when something went wrong.
      const b = await body();
      const amount = Math.trunc(Number(b.amount));
      const note = String(b.note || '').trim().slice(0, 140);
      if (!b.member || !amount || Math.abs(amount) > 5000) fail(400, 'العدد غير صالح');
      if (!note) fail(400, 'اكتب سبب التعديل');
      return json(await givePoints(env, ctx, me, [String(b.member)], amount, 'adjust', note));
    }
    if (m === 'POST' && sub === 'undo') {
      const r = await DB.prepare('UPDATE points SET undone=1, undone_by=? WHERE batch=? AND undone=0').bind(me.id, id).run();
      return json({ ok: true, undone: r.meta.changes });
    }
  }

  /* الرواد — the synced list plus the admins' own columns. */
  if (res === 'members') {
    if (m === 'POST' && !id) {
      const b = await body();
      const name = String(b.name || '').trim().slice(0, 60) || fail(400, 'الاسم مطلوب');
      const mid = 'm_' + uid();
      await DB.prepare(`INSERT INTO members (id, username, name, manual, in_server, joined_at, note, status, label, updated_at, updated_by)
                        VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?)`)
        .bind(mid, String(b.username || '').replace(/^@/, '').slice(0, 40) || null, name, b.joined_at || null,
              str(b.note, 600), status(b.status), str(b.label, 40), Date.now(), me.id).run();
      return json({ id: mid });
    }
    if (m === 'PATCH') {
      const b = await body();
      const cur = await DB.prepare('SELECT manual FROM members WHERE id = ?').bind(id).first() || fail(404, 'غير موجود');
      // On a synced member only the admins' columns change; name and joined date are Discord's.
      await DB.prepare('UPDATE members SET note=?, status=?, label=?, updated_at=?, updated_by=? WHERE id=?')
        .bind(str(b.note, 600), status(b.status), str(b.label, 40), Date.now(), me.id, id).run();
      if (cur.manual) await DB.prepare('UPDATE members SET name=COALESCE(?, name), username=?, joined_at=? WHERE id=?')
        .bind(str(b.name, 60), str(b.username, 40), b.joined_at || null, id).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      const cur = await DB.prepare('SELECT manual FROM members WHERE id = ?').bind(id).first();
      if (!cur || !cur.manual) fail(400, 'يُحذف يدويًا ما أُضيف يدويًا فقط');
      await DB.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  /* السجلات */
  if (res === 'logs') {
    if (m === 'GET') {
      const q = url.searchParams, where = [], args = [];
      if (q.get('type')) { where.push('type = ?'); args.push(q.get('type')); }
      if (q.get('member')) { where.push('(actor_id = ? OR target_id = ?)'); args.push(q.get('member'), q.get('member')); }
      if (q.get('before')) { where.push('at < ?'); args.push(Number(q.get('before'))); }
      if (q.get('hidden') !== '1') where.push('hidden = 0');
      const { results } = await DB.prepare('SELECT * FROM logs ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY at DESC LIMIT 100')
        .bind(...args).all();
      return json(results);
    }
    if (m === 'POST' && !id) {
      const b = await body();
      const summary = str(b.summary, 200) || fail(400, 'اكتب الحدث');
      const lid = uid();
      await DB.prepare(`INSERT INTO logs (id, source, type, actor_id, target_id, summary, detail, at, edited_by)
                        VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?)`)
        .bind(lid, str(b.type, 20) || 'other', me.id, str(b.target_id, 40), summary, str(b.detail, 1500), Number(b.at) || Date.now(), me.id).run();
      return json({ id: lid });
    }
    if (m === 'PATCH') {
      // Fix a wrong entry: hide it, or correct its type and text.
      const b = await body();
      const cur = await DB.prepare('SELECT * FROM logs WHERE id = ?').bind(id).first() || fail(404, 'غير موجود');
      await DB.prepare('UPDATE logs SET hidden=?, type=?, summary=?, detail=?, edited_by=? WHERE id=?')
        .bind(b.hidden !== undefined ? (b.hidden ? 1 : 0) : cur.hidden, str(b.type, 20) || cur.type,
              b.summary !== undefined ? (str(b.summary, 200) || cur.summary) : cur.summary,
              b.detail !== undefined ? str(b.detail, 1500) : cur.detail, me.id, id).run();
      return json({ ok: true });
    }
  }

  /* الإعدادات */
  if (res === 'settings') {
    if (m === 'GET') return json(await settings(env));
    if (m === 'PUT') {
      const b = await body();
      const ids = a => (Array.isArray(a) ? a.map(String).filter(x => /^\d{5,25}$/.test(x)).slice(0, 25) : []);
      await setSetting(env, 'admin_roles', ids(b.admin_roles));
      await setSetting(env, 'log_channels', ids(b.log_channels));
      const ch = {};
      for (const k of POST_KEYS) if (/^\d{5,25}$/.test(String((b.channels || {})[k] || ''))) ch[k] = String(b.channels[k]);
      await setSetting(env, 'channels', ch);
      return json({ ok: true });
    }
  }
  if (res === 'guild' && m === 'GET') {
    const d = discord(env);
    const [g, chans] = await Promise.all([d.guild(), d.channels()]);
    return json({
      roles: g.roles.filter(r => r.id !== env.GUILD_ID).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: r.color })),
      channels: chans.filter(c => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, name: c.name, parent: c.parent_id }))
    });
  }
  if (res === 'sync' && m === 'POST') return json(await syncAll(env));
  if (res === 'commands' && m === 'POST') return json(await discord(env).registerCommands(COMMANDS));

  /* Posting an export (or anything) to a configured channel, as the bot. */
  if (res === 'post' && m === 'POST') {
    const fd = await req.formData();
    const key = String(fd.get('key'));
    if (!POST_KEYS.includes(key)) fail(400, 'روم غير معروف');
    const file = fd.get('file');
    const ok = await post(env, key, String(fd.get('content') || '').slice(0, 1900),
                          file && typeof file !== 'string' ? { blob: file, name: file.name || 'image.png' } : null);
    return json({ ok });
  }

  fail(404, 'غير موجود');
}

/* --------------------------------------------------------------- helpers -- */
const str = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
const status = v => (['active', 'quiet', 'left'].includes(v) ? v : null);
function eventIn(b) {
  const title = str(b.title, 120) || fail(400, 'العنوان مطلوب');
  const at = Number(b.at) || fail(400, 'الموعد مطلوب');
  const end = Number(b.end_at) || null;
  const sups = {};
  for (const [k, v] of Object.entries(b.sups || {}).slice(0, 20)) sups[String(k)] = v === true ? true : (str(v, 60) || true);
  const tasks = {};
  for (const [k, t] of Object.entries(b.tasks || {}).slice(0, 40)) {
    const text = str(t && t.text, 140);
    if (text) tasks[String(k).slice(0, 30)] = { text, who: str(t.who, 40), done: !!t.done, doneBy: t.done ? str(t.doneBy, 40) : null };
  }
  return { title, kind: KIND_LABEL[b.kind] ? b.kind : 'event', at, end_at: end && end > at ? end : null,
           place: str(b.place, 80), note: str(b.note, 600), sups, tasks };
}
async function givePoints(env, ctx, me, members, amount, kind, note) {
  const batch = uid(), at = Date.now();
  await env.DB.batch(members.map(mid => env.DB.prepare(
    'INSERT INTO points (id, batch, member_id, amount, kind, note, by_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(uid() + mid.slice(-4), batch, mid, amount, kind, note, me.id, at)));
  if (kind !== 'adjust') {
    const names = await nameMap(env);
    ctx.waitUntil(post(env, 'points', PT_LABEL[kind] + ' **+' + amount + '** — ' + members.map(x => names.get(x) || x).join('، ') + (note ? '\n' + note : '')));
  }
  return { batch };
}
async function post(env, key, content, file) {
  const ch = ((await getSetting(env, 'channels')) || {})[key];
  if (!ch) return false;
  try { await discord(env).send(ch, { content }, file); return true; } catch (e) { console.error('post', key, e.message); return false; }
}
async function nameMap(env) {
  const { results } = await env.DB.prepare('SELECT id, name FROM members').all();
  return new Map(results.map(r => [r.id, r.name]));
}
const fmtDate = ms => new Date(ms).toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' });
async function settings(env) {
  const last = await env.DB.prepare("SELECT value FROM sync_state WHERE key='last'").first();
  return {
    admin_roles: (await getSetting(env, 'admin_roles')) || [],
    log_channels: (await getSetting(env, 'log_channels')) || [],
    channels: (await getSetting(env, 'channels')) || {},
    last_sync: last ? JSON.parse(last.value) : null
  };
}

/* Everything a page load needs, in one round trip. */
async function boot(env, me) {
  const DB = env.DB;
  if (!me.admin) {
    const { results } = await DB.prepare('SELECT * FROM ideas WHERE by_id = ? ORDER BY at DESC').bind(me.id).all();
    return { me, ideas: results };
  }
  const [members, events, ideas, balances, recent, gr] = await Promise.all([
    DB.prepare('SELECT * FROM members WHERE is_bot = 0 ORDER BY name').all(),
    DB.prepare('SELECT * FROM events WHERE at > ? ORDER BY at').bind(Date.now() - 60 * DAY).all(),
    DB.prepare('SELECT * FROM ideas ORDER BY at DESC LIMIT 300').all(),
    DB.prepare('SELECT member_id, SUM(amount) AS total FROM points WHERE undone = 0 GROUP BY member_id').all(),
    DB.prepare(`SELECT batch, kind, amount, note, by_id, at, MAX(undone) AS undone, GROUP_CONCAT(member_id) AS members
                FROM points GROUP BY batch ORDER BY at DESC LIMIT 40`).all(),
    DB.prepare("SELECT value FROM sync_state WHERE key='guild_roles'").first()
  ]);
  return {
    me,
    members: members.results.map(r => parseRow(r, ['roles'])),
    events: events.results.map(r => parseRow(r, ['sups', 'tasks'])),
    ideas: ideas.results,
    balances: Object.fromEntries(balances.results.map(r => [r.member_id, r.total])),
    recent: recent.results.map(r => ({ ...r, members: String(r.members || '').split(',') })),
    roles: gr ? JSON.parse(gr.value).filter(r => r.id !== env.GUILD_ID) : [],
    settings: await settings(env)
  };
}

/* ---------------------------------------------------------- slash command -- */
const COMMANDS = [{
  name: 'اقتراح', description: 'أرسل اقتراحًا أو ملاحظة لإدارة النادي', type: 1,
  options: [
    { type: 3, name: 'النص', description: 'اقتراحك أو ملاحظتك', required: true, max_length: 1200 },
    { type: 5, name: 'بدون_اسم', description: 'لا يظهر اسمك للإدارة في الروم', required: false }
  ]
}];
async function interactions(req, env) {
  const raw = await req.text();
  if (!(await verifyDiscord(env, req, raw))) return new Response('bad signature', { status: 401 });
  const i = JSON.parse(raw);
  if (i.type === 1) return json({ type: 1 });   // PING
  if (i.type === 2 && i.data.name === 'اقتراح') {
    const opt = n => ((i.data.options || []).find(o => o.name === n) || {}).value;
    const user = (i.member && i.member.user) || i.user;
    const text = String(opt('النص') || '').trim().slice(0, 1200);
    const anon = !!opt('بدون_اسم');
    if (text) {
      await env.DB.prepare("INSERT INTO ideas (id, text, kind, anon, by_id, at, source) VALUES (?, ?, 'idea', ?, ?, ?, 'discord')")
        .bind(uid(), text, anon ? 1 : 0, user.id, Date.now()).run();
      await post(env, 'ideas', '**اقتراح جديد** — ' + (anon ? 'بدون اسم' : displayName(user, i.member)) + '\n' + text);
    }
    return json({ type: 4, data: { flags: 64, content: text ? 'وصل اقتراحك، شكرًا لك 🌱' : 'اكتب الاقتراح' } });
  }
  return json({ type: 4, data: { flags: 64, content: 'أمر غير معروف' } });
}
