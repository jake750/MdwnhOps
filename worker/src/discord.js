/* Discord, through the bot's REST API. Nothing here keeps a gateway socket
   open: everything the panel needs (members, the audit log, a channel's
   messages, posting) is plain REST, which is what a Worker can do.

   `discord(env)` returns the real client, or the fake one from demo.js when
   DEMO=1 so the whole thing runs locally without a bot. */
import { demoDiscord } from './demo.js';

const API = 'https://discord.com/api/v10';
export const PERM = { ADMINISTRATOR: 1n << 3n, MANAGE_GUILD: 1n << 5n };

export function discord(env) {
  if (env.DEMO === '1') return demoDiscord;
  const bot = (path, init = {}) => call(API + path, {
    ...init, headers: { authorization: 'Bot ' + env.BOT_TOKEN, ...(init.headers || {}) }
  });
  const g = env.GUILD_ID;
  return {
    guild: () => bot('/guilds/' + g),
    channels: () => bot('/guilds/' + g + '/channels'),
    member: uid => bot('/guilds/' + g + '/members/' + uid).catch(e => (e.status === 404 ? null : Promise.reject(e))),
    async members() {
      const all = [];
      let after = '0';
      for (;;) {
        const page = await bot('/guilds/' + g + '/members?limit=1000&after=' + after);
        all.push(...page);
        if (page.length < 1000) return all;
        after = page[page.length - 1].user.id;
      }
    },
    auditLog: () => bot('/guilds/' + g + '/audit-logs?limit=100'),
    messages: (channel, after) => bot('/channels/' + channel + '/messages?limit=100' + (after ? '&after=' + after : '')),
    send(channel, payload, file) {
      payload = { ...payload, allowed_mentions: { parse: [] } };   // never ping anyone from the panel
      if (!file) return bot('/channels/' + channel + '/messages', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
      });
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify(payload));
      fd.append('files[0]', file.blob, file.name);
      return bot('/channels/' + channel + '/messages', { method: 'POST', body: fd });
    },
    registerCommands: commands => bot('/applications/' + env.CLIENT_ID + '/guilds/' + g + '/commands', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(commands)
    }),
    async oauthUser(code, redirect) {
      const tok = await call(API + '/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET,
                                    grant_type: 'authorization_code', code, redirect_uri: redirect })
      });
      return call(API + '/users/@me', { headers: { authorization: 'Bearer ' + tok.access_token } });
    }
  };
}

/* One retry on a 429, waiting what Discord asks for. */
async function call(url, init, retried) {
  const r = await fetch(url, init);
  if (r.status === 429 && !retried) {
    const wait = Number(r.headers.get('retry-after') || 1);
    await new Promise(res => setTimeout(res, Math.min(wait, 5) * 1000));
    return call(url, init, true);
  }
  if (!r.ok) { const e = new Error('discord ' + r.status + ' ' + url.replace(API, '')); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json();
}

export const avatarUrl = (user, member, guildId) => {
  if (member && member.avatar) return 'https://cdn.discordapp.com/guilds/' + guildId + '/users/' + user.id + '/avatars/' + member.avatar + '.png?size=96';
  if (user.avatar) return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png?size=96';
  return 'https://cdn.discordapp.com/embed/avatars/' + Number((BigInt(user.id) >> 22n) % 6n) + '.png';
};
export const displayName = (user, member) => (member && member.nick) || user.global_name || user.username;

/* A member's permissions: @everyone's plus every role's, OR'd together. */
export function permsOf(roleIds, guildRoles, guildId) {
  const by = new Map(guildRoles.map(r => [r.id, BigInt(r.permissions)]));
  let p = by.get(guildId) || 0n;
  for (const id of roleIds) p |= by.get(id) || 0n;
  return p;
}
