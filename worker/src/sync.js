/* The cron: pull what changed on the server into D1.
     members      — the whole list; whoever is gone is marked as left
     audit        — Discord's own audit log (bans, kicks, timeouts, roles…)
     log channels — what Carl-bot / Sapphire / YAGPDB write to their log rooms
   Each part runs on its own so one failing (a missing permission, say) does
   not stop the others; the result says what happened. */
import { discord, avatarUrl, displayName } from './discord.js';
import { getSetting, uid } from './db.js';

export async function syncAll(env) {
  const out = {};
  for (const [k, fn] of [['members', syncMembers], ['audit', syncAudit], ['channels', syncLogChannels]]) {
    try { out[k] = await fn(env); } catch (e) { out[k] = 'error: ' + e.message; }
  }
  await env.DB.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)')
    .bind('last', JSON.stringify({ at: Date.now(), out })).run();
  return out;
}

export async function syncMembers(env) {
  const d = discord(env), now = Date.now();
  // The role list rides along: who counts as an admin is worked out from it on every request.
  const guild = await d.guild();
  await env.DB.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)')
    .bind('guild_roles', JSON.stringify(guild.roles.map(r => ({ id: r.id, name: r.name, permissions: r.permissions, color: r.color || 0, position: r.position })))).run();
  const list = await d.members();
  const stmts = list.map(m => env.DB.prepare(
    `INSERT INTO members (id, username, name, avatar, roles, joined_at, in_server, left_at, is_bot, synced_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, NULL, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET username=?2, name=?3, avatar=?4, roles=?5, joined_at=?6,
       in_server=1, left_at=NULL, is_bot=?7, synced_at=?8`
  ).bind(m.user.id, m.user.username, displayName(m.user, m), avatarUrl(m.user, m, env.GUILD_ID),
         JSON.stringify(m.roles || []), Date.parse(m.joined_at) || null, m.user.bot ? 1 : 0, now));
  // Synced rows this pass did not touch have left the server. Manual rows are never touched.
  stmts.push(env.DB.prepare('UPDATE members SET in_server=0, left_at=COALESCE(left_at, ?1) WHERE manual=0 AND in_server=1 AND synced_at < ?1').bind(now));
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  return list.length;
}

const AUDIT = {
  10: ['channel', 'أنشأ رومًا'], 11: ['channel', 'عدّل رومًا'], 12: ['channel', 'حذف رومًا'],
  20: ['kick', 'طرد'], 22: ['ban', 'حظر'], 23: ['unban', 'فكّ الحظر عن'],
  24: ['nick', 'عدّل'], 25: ['role', 'غيّر رتب'], 26: ['other', 'نقل'], 27: ['other', 'فصل'],
  28: ['other', 'أضاف البوت'], 72: ['msg_delete', 'حذف رسالة لـ'], 73: ['msg_delete', 'حذف رسائل في']
};
export async function syncAudit(env) {
  const d = discord(env);
  const res = await d.auditLog();
  const names = new Map((res.users || []).map(u => [u.id, u.global_name || u.username]));
  const known = await namesFromDb(env);
  const nm = id => names.get(id) || known.get(id) || (id ? 'عضو ' + id.slice(-4) : '');
  let added = 0;
  for (const e of res.audit_log_entries || []) {
    const [type0, verb] = AUDIT[e.action_type] || ['other', 'إجراء ' + e.action_type];
    let type = type0, what = '';
    const ch = e.changes || [];
    if (e.action_type === 24) {
      const t = ch.find(c => c.key === 'communication_disabled_until');
      const n = ch.find(c => c.key === 'nick');
      if (t) { type = 'timeout'; what = t.new_value ? 'أسكت' : 'رفع الإسكات عن'; }
      else if (n) what = 'لقب';
    }
    if (e.action_type === 25) {
      const add = (ch.find(c => c.key === '$add') || {}).new_value || [];
      const rem = (ch.find(c => c.key === '$remove') || {}).new_value || [];
      what = [add.length ? '+' + add.map(r => r.name).join('، +') : '', rem.length ? '−' + rem.map(r => r.name).join('، −') : ''].filter(Boolean).join(' ');
    }
    const isChannel = e.action_type >= 10 && e.action_type <= 12;
    const target = isChannel ? (ch.find(c => c.key === 'name') || {}).new_value || '' : nm(e.target_id);
    const summary = (e.action_type === 24 && what && what !== 'لقب' ? what : verb + (what === 'لقب' ? ' لقب' : '')) +
      ' ' + target + (e.action_type === 25 && what ? ' (' + what + ')' : '');
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO logs (id, source, ref, type, actor_id, target_id, summary, detail, at)
       VALUES (?, 'audit', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(uid(), 'audit:' + e.id, type, e.user_id || null, isChannel ? null : e.target_id || null,
           nm(e.user_id) + ' ' + summary.trim(), e.reason ? 'السبب: ' + e.reason : null, snowTime(e.id)).run();
    added += r.meta.changes || 0;
  }
  return added;
}

const KEYWORDS = [
  [/unban/i, 'unban'], [/ban/i, 'ban'], [/kick/i, 'kick'], [/timeout|time ?out|mute/i, 'timeout'],
  [/join/i, 'join'], [/left|leave/i, 'leave'], [/delet/i, 'msg_delete'], [/edit/i, 'msg_edit'],
  [/nick/i, 'nick'], [/role/i, 'role'], [/channel/i, 'channel']
];
export async function syncLogChannels(env) {
  const chans = (await getSetting(env, 'log_channels')) || [];
  if (!chans.length) return 'no log channels set';
  const d = discord(env);
  const known = await namesFromDb(env);
  let added = 0;
  for (const c of chans) {
    const key = 'after:' + c;
    const row = await env.DB.prepare('SELECT value FROM sync_state WHERE key = ?').bind(key).first();
    let after = row && row.value;
    const msgs = await d.messages(c, after);
    for (const m of msgs) {
      if (!after || BigInt(m.id) > BigInt(after)) after = m.id;
      const e = (m.embeds || [])[0];
      const title = (e && (e.title || (e.author && e.author.name))) || '';
      const body = [(e && e.description) || m.content || '', ...((e && e.fields) || []).map(f => f.name + ': ' + f.value)].join('\n');
      if (!title && !body) continue;
      const type = (KEYWORDS.find(([re]) => re.test(title)) || [null, 'other'])[1];
      const target = (body.match(/<@!?(\d+)>/) || [])[1] || null;
      const clean = s => s.replace(/<@!?(\d+)>/g, (_, id) => '@' + (known.get(id) || id.slice(-4))).replace(/<#(\d+)>/g, '#روم').trim();
      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO logs (id, source, ref, type, actor_id, target_id, summary, detail, channel, at)
         VALUES (?, 'channel', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(uid(), 'msg:' + m.id, type, null, target, clean(title || body.split('\n')[0]).slice(0, 200),
             clean(body).slice(0, 1500) || null, c, (e && Date.parse(e.timestamp)) || snowTime(m.id)).run();
      added += r.meta.changes || 0;
    }
    if (after) await env.DB.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').bind(key, after).run();
  }
  return added;
}

async function namesFromDb(env) {
  const { results } = await env.DB.prepare('SELECT id, name FROM members').all();
  return new Map(results.map(r => [r.id, r.name]));
}
export const snowTime = id => Number((BigInt(id) >> 22n) + 1420070400000n);
