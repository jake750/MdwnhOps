/* DEMO=1 — a fake Discord with the shape of the real API, so the panel can be
   built and tried locally before the bot exists. Names are made up. */
const G = '1048483381714878505';
const snow = ms => String((BigInt(ms - 1420070400000) << 22n));   // a Discord id for a moment in time

/* Built on first use, not at load: a Worker's clock reads 0 at module scope. */
let built = null;
function data() {
  if (built) return built;
  const now = Date.now();
  const roles = [
    { id: G, name: '@everyone', permissions: '0', position: 0 },
    { id: '900000000000000001', name: 'Admin', permissions: '8', position: 5, color: 15158332 },
    { id: '900000000000000002', name: 'مشرف', permissions: '0', position: 4, color: 3447003 },
    { id: '900000000000000003', name: 'مدوّن', permissions: '0', position: 3, color: 3066993 },
    { id: '900000000000000004', name: 'مستمع', permissions: '0', position: 2, color: 10181046 },
    { id: '900000000000000005', name: 'Bots', permissions: '0', position: 1 }
  ];
  const people = [
    ['700000000000000001', 'admin_demo', 'أدمن تجريبي', ['900000000000000001'], 400],
    ['700000000000000002', 'taif', 'طيف', ['900000000000000002', '900000000000000003'], 380],
    ['700000000000000003', 'sahab', 'سحاب', ['900000000000000002'], 300],
    ['700000000000000004', 'member_demo', 'عضو تجريبي', ['900000000000000003'], 200],
    ['700000000000000005', 'yaqoot', 'ياقوت', ['900000000000000003'], 150],
    ['700000000000000006', 'imane', 'إيمان', ['900000000000000004'], 90],
    ['700000000000000007', 'ann', 'آن', ['900000000000000004'], 40],
    ['700000000000000008', 'hamza', 'حمزة', ['900000000000000003'], 20],
    ['700000000000000009', 'noor', 'نور', [], 3],
    ['700000000000000099', 'carlbot', 'Carl-bot', ['900000000000000005'], 500, true]
  ];
  const members = people.map(([id, username, name, r, days, bot]) => ({
    user: { id, username, global_name: name, avatar: null, bot: !!bot },
    nick: null, avatar: null, roles: r, joined_at: new Date(now - days * 864e5).toISOString()
  }));
  const channels = [
    { id: '800000000000000001', name: '📆جدول-النشر', type: 0, parent_id: '800000000000000000', position: 1 },
    { id: '800000000000000002', name: '📮┊الإشــــــراف', type: 0, parent_id: '800000000000000000', position: 2 },
    { id: '800000000000000003', name: '🧮┊الفرز-والنقاط', type: 0, parent_id: '800000000000000000', position: 3 },
    { id: '800000000000000004', name: '📢┊جاهز-للنشر', type: 0, parent_id: '800000000000000000', position: 4 },
    { id: '800000000000000005', name: '📁┊الاقتراحــــات', type: 0, parent_id: '800000000000000000', position: 5 },
    { id: '800000000000000006', name: 'mod-logs', type: 0, parent_id: null, position: 9 },
    { id: '800000000000000000', name: '🚨غرفــة العمليــات🚨', type: 4, position: 0 }
  ];
  const ago = h => now - h * 36e5;
  const audit = {
    users: members.map(m => m.user),
    audit_log_entries: [
      { id: snow(ago(2)), action_type: 22, user_id: '700000000000000001', target_id: '700000000000000098', reason: 'سبام' },
      { id: snow(ago(5)), action_type: 25, user_id: '700000000000000001', target_id: '700000000000000005',
        changes: [{ key: '$add', new_value: [{ id: '900000000000000003', name: 'مدوّن' }] }] },
      { id: snow(ago(9)), action_type: 24, user_id: '700000000000000002', target_id: '700000000000000008',
        changes: [{ key: 'communication_disabled_until', new_value: new Date(ago(8)).toISOString() }], reason: 'ألفاظ' },
      { id: snow(ago(30)), action_type: 20, user_id: '700000000000000002', target_id: '700000000000000097', reason: 'حساب وهمي' },
      { id: snow(ago(50)), action_type: 10, user_id: '700000000000000001', target_id: '800000000000000004',
        changes: [{ key: 'name', new_value: '📢┊جاهز-للنشر' }] }
    ]
  };
  const embed = (title, description, color, h) => ({ title, description, color, timestamp: new Date(ago(h)).toISOString() });
  const logMessages = [
    { id: snow(ago(1)), author: { id: '700000000000000099', bot: true }, embeds: [embed('Member joined', '<@700000000000000009> نور', 3066993, 1)] },
    { id: snow(ago(3)), author: { id: '700000000000000099', bot: true }, embeds: [embed('Message deleted in #الواجهة', 'رسالة من <@700000000000000008>: «...»', 15158332, 3)] },
    { id: snow(ago(12)), author: { id: '700000000000000099', bot: true }, embeds: [embed('Member left', '<@700000000000000096> عضو سابق', 15105570, 12)] },
    { id: snow(ago(26)), author: { id: '700000000000000099', bot: true }, embeds: [embed('Message edited in #روض-القلم', 'قبل: «مرحبا» — بعد: «مرحبا بالجميع»', 3447003, 26)] }
  ];
  return (built = { roles, members, channels, audit, logMessages });
}

export const demoDiscord = {
  demo: true,
  guild: async () => ({ id: G, name: 'نادي المدونة', roles: data().roles }),
  channels: async () => data().channels,
  member: async uid => data().members.find(m => m.user.id === uid) || null,
  members: async () => data().members,
  auditLog: async () => data().audit,
  messages: async (channel, after) => (channel === '800000000000000006'
    ? data().logMessages.filter(m => !after || BigInt(m.id) > BigInt(after)) : []),
  async send(channel, payload, file) {
    console.log('[demo] would post to', channel, JSON.stringify(payload).slice(0, 200), file ? '+ ' + file.name : '');
    return { id: snow(Date.now()) };
  },
  registerCommands: async c => c,
  oauthUser: async () => { throw new Error('demo mode: use /auth/demo'); }
};
export const DEMO_USERS = { admin: '700000000000000001', member: '700000000000000004' };
