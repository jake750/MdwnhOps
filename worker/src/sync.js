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

/* Discord's audit action types → [log type, verb, what the target id points at]. */
const AUDIT = {
  1: ['other', 'عدّل إعدادات السيرفر', 'none'],
  10: ['channel', 'أنشأ الروم', 'channel'], 11: ['channel', 'عدّل الروم', 'channel'], 12: ['channel', 'حذف الروم', 'channel'],
  13: ['channel', 'أضاف صلاحيات في', 'channel'], 14: ['channel', 'عدّل صلاحيات', 'channel'], 15: ['channel', 'حذف صلاحيات من', 'channel'],
  20: ['kick', 'طرد', 'user'], 21: ['kick', 'نظّف الأعضاء غير النشطين', 'none'], 22: ['ban', 'حظر', 'user'], 23: ['unban', 'فكّ الحظر عن', 'user'],
  24: ['nick', 'عدّل', 'user'], 25: ['role', 'غيّر رتب', 'user'], 26: ['other', 'نقل أعضاء بين الرومات الصوتية', 'none'],
  27: ['other', 'فصل عضوًا من روم صوتي', 'none'], 28: ['other', 'أضاف البوت', 'user'],
  30: ['role', 'أنشأ الرتبة', 'role'], 31: ['role', 'عدّل الرتبة', 'role'], 32: ['role', 'حذف الرتبة', 'role'],
  40: ['other', 'أنشأ دعوة', 'none'], 41: ['other', 'عدّل دعوة', 'none'], 42: ['other', 'حذف دعوة', 'none'],
  50: ['other', 'أنشأ Webhook', 'none'], 51: ['other', 'عدّل Webhook', 'none'], 52: ['other', 'حذف Webhook', 'none'],
  60: ['other', 'أضاف إيموجي', 'none'], 61: ['other', 'عدّل إيموجي', 'none'], 62: ['other', 'حذف إيموجي', 'none'],
  72: ['msg_delete', 'حذف رسالة لـ', 'user'], 73: ['msg_delete', 'حذف رسائل بالجملة', 'none'],
  74: ['other', 'ثبّت رسالة لـ', 'user'], 75: ['other', 'ألغى تثبيت رسالة لـ', 'user'],
  80: ['other', 'أضاف تطبيقًا للسيرفر', 'none'], 81: ['other', 'عدّل تطبيقًا', 'none'], 82: ['other', 'أزال تطبيقًا', 'none'],
  100: ['other', 'أنشأ فعالية', 'none'], 101: ['other', 'عدّل فعالية', 'none'], 102: ['other', 'حذف فعالية', 'none'],
  110: ['channel', 'أنشأ ثريد', 'channel'], 111: ['channel', 'عدّل ثريد', 'channel'], 112: ['channel', 'حذف ثريد', 'channel'],
  121: ['other', 'عدّل صلاحيات أوامر تطبيق', 'none'],
  140: ['other', 'أنشأ قاعدة AutoMod', 'none'], 141: ['other', 'عدّل قاعدة AutoMod', 'none'], 142: ['other', 'حذف قاعدة AutoMod', 'none'],
  143: ['msg_delete', 'AutoMod حجب رسالة لـ', 'user'], 145: ['timeout', 'AutoMod أسكت', 'user']
};
export async function syncAudit(env) {
  const d = discord(env);
  const [res, chans] = await Promise.all([d.auditLog(), d.channels().catch(() => [])]);
  const names = new Map((res.users || []).map(u => [u.id, u.global_name || u.username]));
  const known = await namesFromDb(env);
  const nm = id => names.get(id) || known.get(id) || (id ? 'عضو ' + id.slice(-4) : '');
  const chName = new Map(chans.map(c => [c.id, c.name]).concat((res.threads || []).map(t => [t.id, t.name])));
  const gr = await env.DB.prepare("SELECT value FROM sync_state WHERE key='guild_roles'").first();
  const roleName = new Map((gr ? JSON.parse(gr.value) : []).map(r => [r.id, r.name]));
  const apps = new Map((res.integrations || []).map(i => [i.id, i.name]).concat((res.application_commands || []).map(a => [a.application_id, a.name])));
  let added = 0;
  for (const e of res.audit_log_entries || []) {
    const [type0, verb, kind] = AUDIT[e.action_type] || ['other', 'إجراء إداري (' + e.action_type + ')', 'none'];
    let type = type0, what = '';
    const ch = e.changes || [];
    const changed = key => ch.find(c => c.key === key) || {};
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
    const isChannel = kind === 'channel';
    // A deleted channel or role is gone from the live lists; its old name is in the change set.
    const target = kind === 'channel' ? '#' + (chName.get(e.target_id) || changed('name').new_value || changed('name').old_value || 'روم')
      : kind === 'role' ? '«' + (roleName.get(e.target_id) || changed('name').new_value || changed('name').old_value || 'رتبة') + '»'
      : kind === 'user' ? nm(e.target_id)
      : e.action_type >= 80 && e.action_type <= 82 ? (apps.get(e.target_id) || changed('name').new_value || '')
      : '';
    // For a permission overwrite, say whose permissions: a role or a member.
    const who = e.action_type >= 13 && e.action_type <= 15 && e.options
      ? ' (' + (e.options.type === '0' || e.options.type === 0 ? 'رتبة «' + (e.options.role_name || roleName.get(e.options.id) || '') + '»' : nm(e.options.id)) + ')' : '';
    const summary = (e.action_type === 24 && what && what !== 'لقب' ? what : verb + (what === 'لقب' ? ' لقب' : '')) +
      (target ? ' ' + target : '') + who + (e.action_type === 25 && what ? ' (' + what + ')' : '');
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
