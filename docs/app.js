/* ==========================================================================
   app.js — غرفة العمليات, the Discord server's admin panel.

   Everything goes through the Worker (config.js → API); the page itself holds
   no secret and reads no database. A session is a token from the Discord
   login, kept in localStorage and sent as a Bearer header.

   Admins see every tab; any other server member sees المقترحات only.
   ========================================================================== */
import { API, DEMO } from './config.js';

/* ---------------------------------------------------------------- utils -- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ar = n => Number(n || 0).toLocaleString('ar-EG');
const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>');
const DAY = 864e5;
const fmtDay = ms => new Date(ms).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = ms => new Date(ms).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
const fmtShort = ms => new Date(ms).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
const fmtStamp = ms => fmtShort(ms) + ' · ' + fmtTime(ms);
const localInput = ms => {
  if (!ms) return '';
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
};
const fromInput = v => (v ? new Date(v).getTime() : null);
const latin = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
/* The week the club plans in starts on Saturday. */
function weekStart(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7) + offset * 7);
  return d.getTime();
}
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}
const ICON = {
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4M6 22v-4h4"/></svg>'
};

/* ------------------------------------------------------------ constants -- */
const TABS = [['plan', 'المخطط'], ['ideas', 'المقترحات'], ['points', 'النقاط'], ['people', 'الرواد'], ['logs', 'السجلات'], ['export', 'التصدير']];
const KINDS = [
  ['event', 'فعالية', '#e54b2a'], ['meeting', 'اجتماع', '#0b6eb9'], ['radio', 'جلسة إذاعية', '#9b5de5'],
  ['reading', 'جلسة قرائية', '#41b9a6'], ['due', 'موعد تسليم', '#f3c02b']
];
const KIND = Object.fromEntries(KINDS.map(([k, l, c]) => [k, { l, c }]));
const IDEA_ST = [['new', 'جديد'], ['study', 'قيد الدراسة'], ['ok', 'معتمد'], ['no', 'مرفوض']];
const IDEA_LABEL = Object.fromEntries(IDEA_ST);
const PT_KINDS = [['stars', 'النجوم', '⭐'], ['tilawa', 'التلاوة', '📖'], ['train', 'التدريب', '🎓'], ['init', 'المبادرات', '💡']];
const PT_KIND = Object.fromEntries(PT_KINDS.map(([k, l, e]) => [k, { l, e }]).concat([['adjust', { l: 'تعديل يدوي', e: '✏️' }]]));
const PT_VALUES = [5, 10, 20, 30, 60];
const PEOPLE_ST = [['active', 'نشط'], ['quiet', 'قليل التفاعل'], ['left', 'غادر']];
const PEOPLE_LABEL = Object.fromEntries(PEOPLE_ST);
const LOG_TYPES = [
  ['join', 'دخول', '🟢'], ['leave', 'خروج', '🚪'], ['ban', 'حظر', '⛔'], ['unban', 'فك حظر', '✅'], ['kick', 'طرد', '👢'],
  ['timeout', 'إسكات', '🔇'], ['role', 'رتب', '🎖️'], ['nick', 'لقب', '🏷️'], ['msg_delete', 'حذف رسالة', '🗑️'],
  ['msg_edit', 'تعديل رسالة', '✏️'], ['channel', 'رومات', '#️⃣'], ['other', 'أخرى', '•']
];
const LOG = Object.fromEntries(LOG_TYPES.map(([k, l, e]) => [k, { l, e }]));
const POST_KEYS = [
  ['supervision', 'المخطط والمهام', '📮┊الإشــــــراف'], ['ideas', 'كل مقترح جديد', '📁┊الاقتراحــــات'],
  ['points', 'كل تسجيل نقاط', '🧮┊الفرز-والنقاط'], ['schedule', 'صورة جدول الفعاليات', '📆جدول-النشر'],
  ['ready', 'صورة الجلسة', '📢┊جاهز-للنشر']
];

/* ----------------------------------------------------------------- state -- */
let token = null;
try { token = localStorage.getItem('ops.token'); } catch (e) {}
let D = null;                  // /api/boot
let tab = 'plan', form = null;
let ptSel = {}, ptKind = 'stars', ptAmt = 10, ptBusy = false;
let peopleQ = '', peopleScope = 'in';
let logs = [], logType = '', logMember = '', logsMore = true, logsHidden = false;
let exportKind = 'schedule', exportWeek = 0;
let guild = null;              // /api/guild, loaded when الإعدادات opens

const me = () => D.me;
const byId = () => (D.byId || (D.byId = Object.fromEntries((D.members || []).map(m => [m.id, m]))));
const nameOf = id => (byId()[id] ? byId()[id].name : id ? 'عضو ' + String(id).slice(-4) : '');
const avatarOf = id => (byId()[id] && byId()[id].avatar) || 'https://cdn.discordapp.com/embed/avatars/0.png';
const present = () => (D.members || []).filter(m => m.in_server);
const posts = k => !!(D.settings && D.settings.channels && D.settings.channels[k]);

/* ------------------------------------------------------------------- api -- */
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { authorization: 'Bearer ' + token } };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['content-type'] = 'application/json'; }
  let r;
  try { r = await fetch(API + '/api/' + path, init); } catch (e) { throw new Error('تعذّر الاتصال'); }
  const v = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403 && path === 'boot') { logout(v.error); throw new Error(v.error || 'سجّل الدخول'); }
  if (!r.ok) throw new Error(v.error || 'تعذّر الطلب');
  return v;
}
const reload = () => api('boot').then(v => { D = v; paint(); });

/* ----------------------------------------------------------------- login -- */
function takeTokenFromHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('token')) { token = h.get('token'); try { localStorage.setItem('ops.token', token); } catch (e) {} }
  if (h.get('error')) setTimeout(() => toast(h.get('error') === 'not_member' ? 'لست عضوًا في سيرفر النادي' : 'تعذّر تسجيل الدخول، حاول مرة أخرى'), 300);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
function logout(msg) {
  token = null; D = null;
  try { localStorage.removeItem('ops.token'); } catch (e) {}
  paintLogin();
  if (msg) toast(msg);
}
function paintLogin() {
  const back = encodeURIComponent(location.origin + location.pathname);
  $('#app').innerHTML =
    '<main class="gate"><div class="gate-card">' +
      '<span class="gate-ico">🚨</span>' +
      '<h1>غرفة العمليات</h1>' +
      '<p>لوحة إدارة سيرفر نادي المدونة. سجّل الدخول بحساب الديسكورد — أعضاء الإدارة يرون اللوحة كاملة، وبقية الأعضاء صندوق المقترحات.</p>' +
      '<a class="op-btn red wide" href="' + API + '/auth/login"><b>الدخول بالديسكورد</b></a>' +
      (DEMO ? '<div class="gate-demo"><span>تجريبي</span><a href="' + API + '/auth/demo?as=admin&back=' + back + '">كأدمن</a>' +
        '<a href="' + API + '/auth/demo?as=member&back=' + back + '">كعضو</a></div>' : '') +
    '</div></main>';
}

/* ----------------------------------------------------------------- shell -- */
function paintShell() {
  $('#app').innerHTML =
    '<div class="op">' +
      '<header class="op-top">' +
        '<h1 class="op-title">غرفة العمليات<span>🚨</span></h1>' +
        '<div class="op-me"><img alt="" src="' + esc(me().avatar) + '"><b>' + esc(me().name) + '</b></div>' +
        '<button type="button" class="op-ico op-gear" data-act="settings" aria-label="الإعدادات" title="الإعدادات"' + (me().admin ? '' : ' hidden') + '>' + ICON.gear + '</button>' +
        '<button type="button" class="op-ico" data-act="logout" aria-label="خروج" title="خروج">' + ICON.out + '</button>' +
        '<div class="cv-seg op-tabs"></div>' +
      '</header>' +
      '<div class="op-body"></div>' +
      '<div class="op-sheet" hidden><div class="op-card"></div></div>' +
    '</div>';
  const root = $('.op');
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
}
function paint() {
  if (!$('.op')) paintShell();
  D.byId = null;
  const admin = me().admin;
  if (!admin) tab = 'ideas';
  const tabs = $('.op-tabs');
  tabs.innerHTML = TABS.filter(([k]) => admin || k === 'ideas').map(([k, l]) =>
    '<button type="button" data-tab="' + k + '" class="' + (tab === k ? 'on' : '') + '">' + l + '</button>').join('');
  tabs.hidden = !admin;
  const body = $('.op-body');
  body.innerHTML = '';
  body.appendChild(({ plan: paintPlan, ideas: paintIdeas, points: paintPoints, people: paintPeople, logs: paintLogs, export: paintExport })[tab]());
  if (tab === 'export') drawExport();
}
const section = cls => { const el = document.createElement('section'); el.className = 'op-sec ' + cls; return el; };
const empty = t => '<p class="op-empty">' + t + '</p>';

/* ── المخطط ─────────────────────────────────────────────────────────────── */
function paintPlan() {
  const el = section('op-plan');
  const all = (D.events || []).slice().sort((a, b) => a.at - b.at);
  const w1 = weekStart(1), w2 = weekStart(2), today = new Date().setHours(0, 0, 0, 0);
  const groups = [
    ['هذا الأسبوع', all.filter(e => e.at < w1 && (e.end_at || e.at) >= today)],
    ['الأسبوع القادم', all.filter(e => e.at >= w1 && e.at < w2)],
    ['لاحقًا', all.filter(e => e.at >= w2)],
    ['مضى', all.filter(e => (e.end_at || e.at) < today).reverse().slice(0, 12)]
  ];
  const open = all.reduce((n, e) => n + Object.values(e.tasks || {}).filter(t => !t.done).length, 0);
  el.innerHTML =
    '<div class="op-bar">' +
      '<p class="op-lead">' + ar(all.filter(e => e.at >= today).length) + ' موعد قادم · ' + ar(open) + ' مهمة مفتوحة</p>' +
      '<button type="button" class="op-btn red" data-act="new-event">' + ICON.plus + '<b>موعد</b></button>' +
    '</div>' +
    (all.length ? groups.filter(g => g[1].length).map(([t, list]) =>
      '<h3 class="op-h">' + t + '</h3><div class="op-tl">' + list.map(eventCard).join('') + '</div>').join('')
      : empty('لا مواعيد بعد — أضف أول فعالية أو اجتماع، ومن يشرف عليه، ومهامه.'));
  return el;
}
function eventCard(e) {
  const k = KIND[e.kind] || KIND.event;
  const tasks = Object.entries(e.tasks || {}).map(([id, t]) => ({ id, ...t })).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  const sups = Object.keys(e.sups || {});
  const past = (e.end_at || e.at) < Date.now();
  return '<article class="op-ev' + (past ? ' past' : '') + '" style="--c:' + k.c + '">' +
    '<div class="op-ev-when"><b>' + esc(fmtShort(e.at)) + '</b><span>' + esc(fmtTime(e.at)) + '</span></div>' +
    '<div class="op-ev-main">' +
      '<header><span class="op-chip">' + esc(k.l) + '</span><h4>' + esc(e.title) + '</h4>' +
        '<button type="button" class="op-ico" data-act="edit-event" data-id="' + esc(e.id) + '" aria-label="تعديل">' + ICON.edit + '</button></header>' +
      '<p class="op-meta">' + esc(fmtDay(e.at)) + (e.place ? ' · ' + esc(e.place) : '') + '</p>' +
      (e.note ? '<p class="op-note">' + linkify(e.note) + '</p>' : '') +
      (sups.length ? '<div class="op-sups">' + sups.map(s =>
        '<span class="op-sup' + (s === me().id ? ' me' : '') + '"><img src="' + esc(avatarOf(s)) + '" alt="" loading="lazy">' +
        '<b>' + esc(nameOf(s)) + '</b>' + (e.sups[s] !== true ? '<i>' + esc(e.sups[s]) + '</i>' : '') + '</span>').join('') + '</div>' : '') +
      (tasks.length ? '<ul class="op-tasks">' + tasks.map(t =>
        '<li class="' + (t.done ? 'done' : '') + '"><button type="button" class="op-tick" data-act="tick" data-id="' + esc(e.id) +
        '" data-t="' + esc(t.id) + '" aria-label="' + (t.done ? 'إلغاء الإنجاز' : 'تم') + '">' + ICON.check + '</button>' +
        '<span>' + esc(t.text) + '</span>' + (t.who ? '<i>' + esc(nameOf(t.who)) + '</i>' : '') + '</li>').join('') + '</ul>' : '') +
      (posts('supervision') ? '<button type="button" class="op-link" data-act="send-event" data-id="' + esc(e.id) + '">إرسال إلى الإشراف ↗</button>' : '') +
    '</div></article>';
}
function openEventForm(id) {
  const e = id ? D.events.find(x => x.id === id) : null;
  form = { type: 'event', id, sups: Object.assign({}, e && e.sups),
           tasks: Object.entries((e && e.tasks) || {}).map(([tid, t]) => ({ id: tid, text: t.text, who: t.who || '', done: !!t.done })) };
  const card = sheet();
  card.innerHTML =
    '<h3>' + (id ? 'تعديل الموعد' : 'موعد جديد') + '</h3>' +
    '<label>العنوان<input name="title" maxlength="120" value="' + esc(e ? e.title : '') + '"></label>' +
    '<label>النوع<select name="kind">' + KINDS.map(([k, l]) =>
      '<option value="' + k + '"' + ((e ? e.kind : 'event') === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<div class="op-two"><label>يبدأ<input type="datetime-local" name="at" value="' + localInput(e ? e.at : null) + '"></label>' +
    '<label>ينتهي<input type="datetime-local" name="end" value="' + localInput(e ? e.end_at : null) + '"></label></div>' +
    '<label>المكان / الروم<input name="place" maxlength="80" value="' + esc(e ? e.place : '') + '" placeholder="☕ المقهى"></label>' +
    '<label>ملاحظة<textarea name="note" rows="2" maxlength="600">' + esc(e ? e.note : '') + '</textarea></label>' +
    '<fieldset><legend>المشرفون</legend><input class="op-q" data-q="sups" placeholder="بحث…">' +
      '<div class="op-people" data-pick="sups"></div><div class="op-roles"></div></fieldset>' +
    '<fieldset><legend>المهام</legend><div class="op-tlist"></div>' +
      '<button type="button" class="op-link" data-act="add-task">+ مهمة</button></fieldset>' +
    '<footer>' + (id ? '<button type="button" class="op-btn ghost" data-act="del-event">' + ICON.trash + '<b>حذف</b></button>' : '') +
      '<button type="button" class="op-btn" data-act="close">إلغاء</button>' +
      '<button type="button" class="op-btn red" data-act="save-event"><b>حفظ</b></button></footer>';
  paintPick('sups', form.sups);
  paintRoles();
  paintTaskRows();
}
function paintRoles() {
  const host = $('.op-roles'); if (!host) return;
  host.innerHTML = Object.keys(form.sups).map(s =>
    '<label class="op-role"><span>' + esc(nameOf(s)) + '</span><input data-role="' + esc(s) + '" maxlength="60" placeholder="دوره (اختياري)" value="' +
    esc(form.sups[s] === true ? '' : form.sups[s]) + '"></label>').join('');
}
function paintTaskRows() {
  const host = $('.op-tlist'); if (!host) return;
  host.innerHTML = form.tasks.map((t, i) =>
    '<div class="op-trow" data-i="' + i + '"><input data-f="text" maxlength="140" value="' + esc(t.text) + '" placeholder="المهمة">' +
    '<select data-f="who"><option value="">—</option>' + present().map(m =>
      '<option value="' + esc(m.id) + '"' + (t.who === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select>' +
    '<button type="button" class="op-ico" data-act="rm-task" data-i="' + i + '" aria-label="إزالة">' + ICON.x + '</button></div>').join('');
}
async function saveEvent(btn) {
  const c = $('.op-card'), v = n => $('[name="' + n + '"]', c).value.trim();
  const tasks = {};
  form.tasks.filter(t => t.text.trim()).forEach((t, i) => {
    tasks[t.id || ('t' + Date.now().toString(36) + i)] = { text: t.text.trim(), who: t.who || null, done: !!t.done };
  });
  const rec = { title: v('title'), kind: v('kind'), at: fromInput(v('at')), end_at: fromInput(v('end')), place: v('place'), note: v('note'), sups: form.sups, tasks };
  if (!rec.title || !rec.at) return toast('العنوان والموعد مطلوبان');
  btn.disabled = true;
  try {
    await api('events' + (form.id ? '/' + form.id : ''), { method: form.id ? 'PATCH' : 'POST', body: rec });
    toast(form.id ? 'حُفظ الموعد' : 'أُضيف الموعد'); closeSheet(); await reload();
  } catch (e) { btn.disabled = false; toast(e.message); }
}
async function tick(eid, tid) {
  const e = D.events.find(x => x.id === eid), t = e && e.tasks[tid];
  if (!t) return;
  t.done = !t.done; paint();
  try { await api('events/' + eid + '/tasks/' + tid, { method: 'PATCH', body: { done: t.done } }); }
  catch (err) { t.done = !t.done; paint(); toast(err.message); }
}

/* ── المقترحات ──────────────────────────────────────────────────────────── */
function paintIdeas() {
  const el = section('op-ideas');
  const admin = me().admin;
  const all = (D.ideas || []).slice().sort((a, b) => b.at - a.at);
  el.innerHTML =
    '<form class="op-compose" data-form="idea">' +
      '<textarea name="text" rows="3" maxlength="1200" placeholder="اقتراحك أو ملاحظتك للنادي…"></textarea>' +
      '<div class="op-row">' +
        '<div class="cv-seg op-mini" data-seg="ikind"><button type="button" data-v="idea" class="on">اقتراح</button><button type="button" data-v="note">ملاحظة</button></div>' +
        '<label class="op-check"><input type="checkbox" name="anon"> بدون اسم</label>' +
        '<button type="submit" class="op-btn red"><b>إرسال</b></button>' +
      '</div>' +
      '<p class="op-fine">أو من الديسكورد مباشرة: <code>/اقتراح</code></p>' +
    '</form>' +
    '<h3 class="op-h">' + (admin ? 'كل المقترحات' : 'مقترحاتي') + ' <i>' + ar(all.length) + '</i></h3>' +
    (all.length ? '<div class="op-list">' + all.map(i => ideaCard(i, admin)).join('') + '</div>'
      : empty(admin ? 'لا مقترحات بعد.' : 'لم ترسل شيئًا بعد — كل فكرة تُقرأ.'));
  return el;
}
function ideaCard(i, admin) {
  const st = i.status || 'new';
  const who = i.anon ? (admin ? 'بدون اسم' : 'أنت (بدون اسم)') : admin ? nameOf(i.by_id) : 'أنت';
  return '<article class="op-idea st-' + st + '">' +
    '<header><span class="op-chip">' + (i.kind === 'note' ? 'ملاحظة' : 'اقتراح') + '</span><b>' + esc(who) + '</b>' +
      '<i>' + esc(fmtShort(i.at)) + (i.source === 'discord' ? ' · من الديسكورد' : '') + '</i>' +
      (admin ? '<select class="op-st" data-act="idea-st" data-id="' + esc(i.id) + '">' + IDEA_ST.map(([k, l]) =>
        '<option value="' + k + '"' + (st === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
        : '<span class="op-stl">' + esc(IDEA_LABEL[st]) + '</span>') +
    '</header>' +
    '<p>' + linkify(i.text) + '</p>' +
    (i.reply ? '<p class="op-reply"><b>رد ' + esc(admin ? nameOf(i.reply_by) : 'الإدارة') + '</b>' + linkify(i.reply) + '</p>' : '') +
    (admin ? '<div class="op-row"><input class="op-rin" data-id="' + esc(i.id) + '" maxlength="600" placeholder="رد…" value="' + esc(i.reply || '') + '">' +
      '<button type="button" class="op-btn" data-act="idea-reply" data-id="' + esc(i.id) + '"><b>رد</b></button>' +
      '<button type="button" class="op-ico" data-act="idea-del" data-id="' + esc(i.id) + '" aria-label="حذف">' + ICON.trash + '</button></div>' : '') +
  '</article>';
}
async function sendIdea(f) {
  const text = f.text.value.trim();
  if (!text) return toast('اكتب المقترح');
  const btn = $('[type=submit]', f); btn.disabled = true;
  try {
    await api('ideas', { method: 'POST', body: { text, kind: $('[data-seg="ikind"] .on', f).dataset.v, anon: f.anon.checked } });
    toast('وصل، شكرًا لك'); await reload();
  } catch (e) { btn.disabled = false; toast(e.message); }
}

/* ── النقاط ─────────────────────────────────────────────────────────────── */
function paintPoints() {
  const el = section('op-points');
  const n = Object.keys(ptSel).length;
  const board = present().map(m => ({ m, t: D.balances[m.id] || 0 })).filter(x => x.t).sort((a, b) => b.t - a.t);
  el.innerHTML =
    '<div class="op-compose">' +
      '<div class="op-kinds">' + PT_KINDS.map(([k, l, e]) =>
        '<button type="button" data-ptk="' + k + '" class="' + (ptKind === k ? 'on' : '') + '"><span>' + e + '</span>' + l + '</button>').join('') + '</div>' +
      '<div class="op-row op-amts">' + PT_VALUES.map(v =>
        '<button type="button" data-amt="' + v + '" class="' + (ptAmt === v ? 'on' : '') + '">+' + ar(v) + '</button>').join('') +
        '<input type="text" class="op-amt" inputmode="numeric" value="' + (PT_VALUES.includes(ptAmt) ? '' : ar(ptAmt)) + '" placeholder="عدد آخر">' +
      '</div>' +
      '<input class="op-pnote" maxlength="140" placeholder="التفاصيل — مثل: جلسة الأربعاء، ٣٣ دقيقة">' +
      '<div class="op-row"><input class="op-q" data-q="pts" placeholder="بحث عن عضو…">' +
        '<button type="button" class="op-link" data-act="pt-none"' + (n ? '' : ' hidden') + '>إلغاء التحديد</button></div>' +
      '<div class="op-people" data-pick="pts"></div>' +
      '<button type="button" class="op-btn red wide" data-act="pt-go"' + (n && !ptBusy ? '' : ' disabled') + '><b>' + goLabel() + '</b></button>' +
    '</div>' +
    '<div class="op-cols">' +
      '<div><h3 class="op-h">الأرصدة</h3>' + (board.length ? '<ol class="op-board">' + board.map(({ m, t }, i) =>
        '<li><span class="op-rank">' + ar(i + 1) + '</span><button type="button" class="op-who" data-act="pt-ledger" data-id="' + esc(m.id) + '" title="سجل نقاطه"><img src="' + esc(m.avatar) + '" alt="" loading="lazy"><b>' + esc(m.name) + '</b></button>' +
        '<em>' + ar(t) + '</em><button type="button" class="op-ico" data-act="pt-adjust" data-id="' + esc(m.id) + '" aria-label="تعديل يدوي" title="تعديل يدوي">' + ICON.edit + '</button></li>').join('') + '</ol>'
        : empty('لا نقاط بعد.')) +
        '<button type="button" class="op-link" data-act="pt-adjust">✏️ تعديل يدوي لعضو آخر</button></div>' +
      '<div><h3 class="op-h">آخر التسجيلات</h3>' + ((D.recent || []).length ? '<div class="op-list">' + D.recent.map(logRow).join('') + '</div>' : empty('لا تسجيلات بعد.')) + '</div>' +
    '</div>';
  paintPick('pts', ptSel, null, el);
  return el;
}
const goLabel = () => { const n = Object.keys(ptSel).length; return n ? 'أضف ' + ar(ptAmt) + ' نقطة لـ ' + ar(n) + (n === 1 ? ' عضو' : ' أعضاء') : 'اختر الأعضاء'; };
function logRow(l, mine) {
  const k = PT_KIND[l.kind] || { l: '', e: '•' };
  return '<div class="op-log' + (l.undone ? ' undone' : '') + '"><span class="op-log-e">' + k.e + '</span>' +
    '<div><b>' + (l.amount > 0 ? '+' : '−') + ar(Math.abs(l.amount)) + ' ' + esc(k.l) + '</b>' + (mine ? '' : ' · ' + esc(l.members.map(nameOf).join('، '))) +
    (l.note ? '<p>' + esc(l.note) + '</p>' : '') +
    '<i>' + esc(fmtStamp(l.at)) + ' · ' + esc(nameOf(l.by_id)) + (l.undone ? ' · أُلغي' : '') + '</i></div>' +
    (l.undone || mine ? '' : '<button type="button" class="op-link" data-act="pt-undo" data-id="' + esc(l.batch) + '">تراجع</button>') + '</div>';
}
async function givePoints() {
  const members = Object.keys(ptSel);
  if (!members.length || ptBusy) return;
  const k = PT_KIND[ptKind];
  if (!confirm('إضافة ' + ptAmt + ' نقطة (' + k.l + ') إلى ' + members.map(nameOf).join('، ') + '؟')) return;
  ptBusy = true; paint();
  try {
    await api('points', { method: 'POST', body: { members, amount: ptAmt, kind: ptKind, note: ($('.op-pnote').value || '').trim() } });
    ptSel = {}; toast('أُضيفت النقاط ✨');
  } catch (e) { toast(e.message); }
  ptBusy = false; await reload();
}
function openAdjust(id) {
  form = { type: 'adjust' };
  const card = sheet();
  card.innerHTML =
    '<h3>تعديل يدوي للرصيد</h3>' +
    '<p class="op-fine">لتصحيح خطأ: اكتب عددًا موجبًا للزيادة أو سالبًا للنقص (مثل ‎-10). يُسجَّل التعديل باسمك مع السبب، ويمكن التراجع عنه.</p>' +
    '<label>العضو<select name="member">' + present().map(m =>
      '<option value="' + esc(m.id) + '"' + (m.id === id ? ' selected' : '') + '>' + esc(m.name) + ' — ' + ar(D.balances[m.id] || 0) + '</option>').join('') + '</select></label>' +
    '<label>العدد<input name="amount" inputmode="numeric" dir="ltr" placeholder="-10"></label>' +
    '<label>السبب<input name="note" maxlength="140" placeholder="مثل: سُجّلت مرتين بالخطأ"></label>' +
    '<footer><button type="button" class="op-btn" data-act="close">إلغاء</button>' +
      '<button type="button" class="op-btn red" data-act="save-adjust"><b>حفظ</b></button></footer>';
}
/* One member's ledger: every grant and deduction, undone ones struck through. */
async function openLedger(id) {
  form = { type: 'ledger' };
  const card = sheet();
  card.innerHTML = '<h3>سجل نقاط ' + esc(nameOf(id)) + '</h3><p class="op-fine">جارٍ التحميل…</p>';
  let rows;
  try { rows = await api('points/history?member=' + encodeURIComponent(id)); }
  catch (e) { card.innerHTML = '<h3>سجل النقاط</h3><p class="op-fine">' + esc(e.message) + '</p>'; return; }
  if (!form || form.type !== 'ledger') return;
  const live = rows.filter(r => !r.undone);
  const sum = f => live.filter(f).reduce((a, r) => a + r.amount, 0);
  const plus = sum(r => r.amount > 0), minus = -sum(r => r.amount < 0);
  const byKind = PT_KINDS.map(([k, l, e]) => [e, l, sum(r => r.kind === k)]).filter(x => x[2]);
  card.innerHTML =
    '<h3>سجل نقاط ' + esc(nameOf(id)) + '</h3>' +
    '<div class="op-ledger-sum"><div><b>' + ar(D.balances[id] || 0) + '</b><span>الرصيد</span></div>' +
      '<div class="up"><b>+' + ar(plus) + '</b><span>أخذ</span></div>' +
      '<div class="down"><b>−' + ar(minus) + '</b><span>خُصم</span></div></div>' +
    (byKind.length ? '<div class="op-chips">' + byKind.map(([e, l, n]) => '<span class="op-chip">' + e + ' ' + esc(l) + ' ' + ar(n) + '</span>').join('') + '</div>' : '') +
    (rows.length ? '<div class="op-list">' + rows.map(r => logRow({ ...r, members: [id] }, true)).join('') + '</div>' : empty('لا نقاط مسجّلة له بعد.')) +
    (rows.length >= 200 ? '<p class="op-fine">يظهر آخر ٢٠٠ تسجيل.</p>' : '') +
    '<footer><button type="button" class="op-btn" data-act="pt-adjust" data-id="' + esc(id) + '">✏️ تعديل يدوي</button>' +
      '<button type="button" class="op-btn red" data-act="close"><b>إغلاق</b></button></footer>';
}
async function saveAdjust(btn) {
  const c = $('.op-card');
  const amount = parseInt(latin($('[name=amount]', c).value).replace(/[−–]/g, '-'), 10);
  const note = $('[name=note]', c).value.trim();
  if (!amount) return toast('اكتب العدد');
  if (!note) return toast('اكتب سبب التعديل');
  btn.disabled = true;
  try { await api('points/adjust', { method: 'POST', body: { member: $('[name=member]', c).value, amount, note } }); toast('حُفظ التعديل'); closeSheet(); await reload(); }
  catch (e) { btn.disabled = false; toast(e.message); }
}

/* ── الرواد ─────────────────────────────────────────────────────────────── */
function paintPeople() {
  const el = section('op-people-tab');
  const all = (D.members || []);
  const stOf = p => p.status || (p.in_server ? 'active' : 'left');
  const inScope = all.filter(p => peopleScope === 'all' ? true : peopleScope === 'in' ? p.in_server : !p.in_server);
  const q = peopleQ.trim().toLowerCase();
  const shown = q ? inScope.filter(p => ((p.name || '') + ' ' + (p.username || '') + ' ' + (p.label || '')).toLowerCase().includes(q)) : inScope;
  const roleName = Object.fromEntries((D.roles || []).map(r => [r.id, r.name]));
  const last = D.settings && D.settings.last_sync;
  el.innerHTML =
    '<div class="op-bar">' +
      '<p class="op-lead">' + ar(all.filter(p => p.in_server).length) + ' في السيرفر · ' + ar(all.filter(p => !p.in_server).length) + ' غادروا' +
        (last ? ' · آخر مزامنة ' + esc(fmtTime(last.at)) : '') + '</p>' +
      '<button type="button" class="op-ico" data-act="sync" aria-label="مزامنة الآن" title="مزامنة الآن">' + ICON.sync + '</button>' +
      '<button type="button" class="op-btn red" data-act="new-person">' + ICON.plus + '<b>عضو</b></button>' +
    '</div>' +
    '<div class="op-row">' +
      '<div class="cv-seg op-mini" data-seg="pscope">' + [['in', 'في السيرفر'], ['left', 'غادروا'], ['all', 'الكل']].map(([k, l]) =>
        '<button type="button" data-v="' + k + '" class="' + (peopleScope === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>' +
      '<input class="op-q" data-q="people" placeholder="بحث بالاسم أو اليوزر…" value="' + esc(peopleQ) + '">' +
    '</div>' +
    (shown.length ? '<div class="op-grid">' + shown.map(p =>
      '<button type="button" class="op-person st-' + stOf(p) + '" data-act="edit-person" data-id="' + esc(p.id) + '">' +
        '<img src="' + esc(p.avatar || avatarOf('')) + '" alt="" loading="lazy">' +
        '<b>' + esc(p.name) + (p.manual ? ' <small>يدوي</small>' : '') + '</b>' +
        '<span>' + esc([p.username ? '@' + p.username : '', p.label || (p.roles || []).map(r => roleName[r]).filter(Boolean).slice(0, 2).join('، ')].filter(Boolean).join(' · ')) + '</span>' +
        '<i>' + esc(PEOPLE_LABEL[stOf(p)]) + (p.joined_at ? ' · منذ ' + esc(fmtShort(p.joined_at)) : '') + (p.note ? ' · 📝' : '') + '</i>' +
      '</button>').join('') + '</div>'
      : empty(all.length ? 'لا نتائج.' : 'لم تتم المزامنة بعد — اضغط زر المزامنة.'));
  return el;
}
function openPersonForm(id) {
  const p = id ? byId()[id] : null;
  const synced = p && !p.manual;
  form = { type: 'person', id };
  const roleName = Object.fromEntries((D.roles || []).map(r => [r.id, r.name]));
  const card = sheet();
  card.innerHTML =
    '<h3>' + (id ? esc(p.name) : 'عضو جديد') + '</h3>' +
    (synced ? '<p class="op-fine">الاسم واليوزر والرتب وتاريخ الانضمام تأتي من الديسكورد. الحالة والدور والملاحظات لكم، ولا تمسحها المزامنة.</p>' +
      '<div class="op-chips">' + (p.roles || []).map(r => roleName[r] ? '<span class="op-chip">' + esc(roleName[r]) + '</span>' : '').join('') + '</div>' : '') +
    '<div class="op-two"><label>الاسم<input name="name" maxlength="60" value="' + esc(p ? p.name : '') + '"' + (synced ? ' disabled' : '') + '></label>' +
    '<label>يوزر الديسكورد<input name="username" maxlength="40" dir="ltr" value="' + esc(p ? p.username : '') + '"' + (synced ? ' disabled' : '') + '></label></div>' +
    '<div class="op-two"><label>الدور<input name="label" maxlength="40" value="' + esc(p ? p.label : '') + '" placeholder="مدوّن، مستمع…"></label>' +
    '<label>الحالة<select name="status"><option value="">' + (synced ? 'تلقائي (' + (p.in_server ? 'نشط' : 'غادر') + ')' : '—') + '</option>' + PEOPLE_ST.map(([k, l]) =>
      '<option value="' + k + '"' + (p && p.status === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
    (!synced ? '<label>انضم في<input type="date" name="joined" value="' + (p && p.joined_at ? localInput(p.joined_at).slice(0, 10) : '') + '"></label>' : '') +
    '<label>ملاحظات<textarea name="note" rows="3" maxlength="600">' + esc(p ? p.note : '') + '</textarea></label>' +
    (p ? '<div class="op-pts-mini">رصيد النقاط: <b>' + ar(D.balances[p.id] || 0) + '</b> <button type="button" class="op-link" data-act="pt-ledger" data-id="' + esc(p.id) + '">السجل</button> <button type="button" class="op-link" data-act="pt-adjust" data-id="' + esc(p.id) + '">تعديل</button></div>' : '') +
    '<footer>' + (p && p.manual ? '<button type="button" class="op-btn ghost" data-act="del-person">' + ICON.trash + '<b>حذف</b></button>' : '') +
      '<button type="button" class="op-btn" data-act="close">إلغاء</button>' +
      '<button type="button" class="op-btn red" data-act="save-person"><b>حفظ</b></button></footer>';
}
async function savePerson(btn) {
  const c = $('.op-card'), v = n => { const el = $('[name="' + n + '"]', c); return el ? el.value.trim() : ''; };
  const rec = { name: v('name'), username: v('username'), label: v('label'), status: v('status') || null, note: v('note'),
                joined_at: v('joined') ? new Date(v('joined')).getTime() : null };
  if (!form.id && !rec.name) return toast('الاسم مطلوب');
  btn.disabled = true;
  try { await api('members' + (form.id ? '/' + form.id : ''), { method: form.id ? 'PATCH' : 'POST', body: rec }); toast('حُفظ'); closeSheet(); await reload(); }
  catch (e) { btn.disabled = false; toast(e.message); }
}

/* ── السجلات ────────────────────────────────────────────────────────────── */
function paintLogs() {
  const el = section('op-logs');
  el.innerHTML =
    '<div class="op-bar"><p class="op-lead">من سجل التدقيق في الديسكورد ورومات الـ logs' +
      ((D.settings.log_channels || []).length ? '' : ' — <a href="#" data-act="settings">اختر رومات الـ logs</a>') + '</p>' +
      '<button type="button" class="op-ico" data-act="sync" aria-label="مزامنة الآن" title="مزامنة الآن">' + ICON.sync + '</button>' +
      '<button type="button" class="op-btn red" data-act="new-log">' + ICON.plus + '<b>حدث</b></button></div>' +
    '<div class="op-row op-ltypes"><button type="button" data-ltype="" class="' + (logType ? '' : 'on') + '">الكل</button>' + LOG_TYPES.map(([k, l, e]) =>
      '<button type="button" data-ltype="' + k + '" class="' + (logType === k ? 'on' : '') + '">' + e + ' ' + l + '</button>').join('') + '</div>' +
    '<div class="op-row"><select class="op-lmember"><option value="">كل الأعضاء</option>' + present().map(m =>
      '<option value="' + esc(m.id) + '"' + (logMember === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select>' +
      '<label class="op-check"><input type="checkbox" class="op-lhidden"' + (logsHidden ? ' checked' : '') + '> المخفية أيضًا</label></div>' +
    '<div class="op-list op-loglist"><div class="op-loader"><span></span><span></span><span></span></div></div>';
  loadLogs(true);
  return el;
}
async function loadLogs(fresh) {
  const q = new URLSearchParams();
  if (logType) q.set('type', logType);
  if (logMember) q.set('member', logMember);
  if (logsHidden) q.set('hidden', '1');
  if (!fresh && logs.length) q.set('before', logs[logs.length - 1].at);
  try {
    const page = await api('logs?' + q);
    logs = fresh ? page : logs.concat(page);
    logsMore = page.length === 100;
  } catch (e) { toast(e.message); }
  const host = $('.op-loglist'); if (!host) return;
  host.innerHTML = logs.length ? logs.map(logEntry).join('') +
    (logsMore ? '<button type="button" class="op-btn" data-act="logs-more"><b>أقدم</b></button>' : '') : empty('لا أحداث.');
}
function logEntry(l) {
  const t = LOG[l.type] || LOG.other;
  return '<div class="op-logev' + (l.hidden ? ' hidden-ev' : '') + '"><span class="op-log-e" title="' + esc(t.l) + '">' + t.e + '</span>' +
    '<div><b>' + esc(l.summary) + '</b>' + (l.detail ? '<p>' + esc(l.detail) + '</p>' : '') +
    '<i>' + esc(fmtStamp(l.at)) + ' · ' + ({ audit: 'سجل التدقيق', channel: 'روم logs', manual: 'يدوي — ' + nameOf(l.edited_by) })[l.source] +
      (l.edited_by && l.source !== 'manual' ? ' · عُدّل' : '') + (l.hidden ? ' · مخفي' : '') + '</i></div>' +
    '<button type="button" class="op-ico" data-act="edit-log" data-id="' + esc(l.id) + '" aria-label="تعديل">' + ICON.edit + '</button></div>';
}
function openLogForm(id) {
  const l = id ? logs.find(x => x.id === id) : null;
  form = { type: 'log', id };
  const card = sheet();
  card.innerHTML =
    '<h3>' + (l ? 'تصحيح الحدث' : 'حدث يدوي') + '</h3>' +
    '<label>النوع<select name="type">' + LOG_TYPES.map(([k, lab, e]) =>
      '<option value="' + k + '"' + ((l ? l.type : 'other') === k ? ' selected' : '') + '>' + e + ' ' + lab + '</option>').join('') + '</select></label>' +
    '<label>الحدث<input name="summary" maxlength="200" value="' + esc(l ? l.summary : '') + '"></label>' +
    '<label>التفاصيل<textarea name="detail" rows="3" maxlength="1500">' + esc(l ? l.detail : '') + '</textarea></label>' +
    (!l ? '<div class="op-two"><label>العضو المعني<select name="target"><option value="">—</option>' + present().map(m =>
      '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>').join('') + '</select></label>' +
      '<label>الوقت<input type="datetime-local" name="at" value="' + localInput(Date.now()) + '"></label></div>' : '') +
    '<footer>' + (l ? '<button type="button" class="op-btn ghost" data-act="hide-log">' + (l.hidden ? 'إظهار' : 'إخفاء') + '</button>' : '') +
      '<button type="button" class="op-btn" data-act="close">إلغاء</button>' +
      '<button type="button" class="op-btn red" data-act="save-log"><b>حفظ</b></button></footer>';
}
async function saveLog(btn, hide) {
  const c = $('.op-card'), v = n => { const el = $('[name="' + n + '"]', c); return el ? el.value.trim() : ''; };
  const l = form.id && logs.find(x => x.id === form.id);
  const body = hide ? { hidden: !l.hidden } : { type: v('type'), summary: v('summary'), detail: v('detail') };
  if (!hide && !body.summary) return toast('اكتب الحدث');
  if (!form.id) Object.assign(body, { target_id: v('target') || null, at: fromInput(v('at')) });
  btn.disabled = true;
  try { await api('logs' + (form.id ? '/' + form.id : ''), { method: form.id ? 'PATCH' : 'POST', body }); toast('حُفظ'); closeSheet(); loadLogs(true); }
  catch (e) { btn.disabled = false; toast(e.message); }
}

/* ── التصدير ────────────────────────────────────────────────────────────── */
function paintExport() {
  const el = section('op-export');
  const sessions = (D.events || []).filter(e => (e.kind === 'radio' || e.kind === 'reading') && e.at >= Date.now() - DAY).sort((a, b) => a.at - b.at);
  const key = exportKind === 'schedule' ? 'schedule' : 'ready';
  el.innerHTML =
    '<div class="cv-seg op-mini" data-seg="xkind">' +
      '<button type="button" data-v="schedule" class="' + (exportKind === 'schedule' ? 'on' : '') + '">جدول الفعاليات</button>' +
      '<button type="button" data-v="session" class="' + (exportKind === 'session' ? 'on' : '') + '">جلسة إذاعية / قرائية</button>' +
    '</div>' +
    (exportKind === 'schedule'
      ? '<div class="cv-seg op-mini" data-seg="xweek"><button type="button" data-v="0" class="' + (exportWeek === 0 ? 'on' : '') + '">هذا الأسبوع</button>' +
        '<button type="button" data-v="1" class="' + (exportWeek === 1 ? 'on' : '') + '">الأسبوع القادم</button></div>'
      : '<form class="op-xform" data-form="session">' +
          (sessions.length ? '<label>من المخطط<select name="from"><option value="">— اكتب يدويًا —</option>' + sessions.map(e =>
            '<option value="' + esc(e.id) + '">' + esc(e.title) + ' · ' + esc(fmtShort(e.at)) + '</option>').join('') + '</select></label>' : '') +
          '<div class="op-two"><label>النوع<select name="kind"><option value="radio">إذاعية</option><option value="reading">قرائية</option></select></label>' +
          '<label>الموعد<input type="datetime-local" name="at"></label></div>' +
          '<label>العنوان<input name="title" maxlength="80" placeholder="عنوان الجلسة"></label>' +
          '<div class="op-two"><label>المقدّم / القارئ<input name="host" maxlength="60"></label>' +
          '<label>الروم<input name="place" maxlength="60" value="☕ المقهى"></label></div>' +
          '<label>سطر إضافي<input name="note" maxlength="120" placeholder="الكتاب، الضيف، المحاور…"></label>' +
        '</form>') +
    '<div class="op-canvas"><canvas width="1080" height="1350"></canvas></div>' +
    '<div class="op-row op-xbtns">' +
      '<button type="button" class="op-btn" data-act="x-save"><b>حفظ الصورة</b></button>' +
      '<button type="button" class="op-btn red" data-act="x-send"' + (posts(key) ? '' : ' disabled title="اختر الروم من الإعدادات"') + '><b>إرسال إلى ' +
        (exportKind === 'schedule' ? 'جدول-النشر' : 'جاهز-للنشر') + '</b></button>' +
    '</div>';
  return el;
}
function sessionFields() {
  const f = $('[data-form="session"]');
  if (!f) return {};
  return { kind: f.kind.value, at: fromInput(f.at.value), title: f.title.value.trim(), host: f.host.value.trim(), place: f.place.value.trim(), note: f.note.value.trim() };
}
let fontReady = null;
const font = (w, px) => w + ' ' + px + 'px Norsal, system-ui, sans-serif';
async function drawExport() {
  const cv = $('.op-canvas canvas'); if (!cv) return;
  fontReady = fontReady || Promise.all([document.fonts.load(font(800, 40)), document.fonts.load(font(400, 40))]).catch(() => {});
  await fontReady;
  if (exportKind === 'schedule') drawSchedule(cv); else drawSession(cv, sessionFields());
}
function backdrop(ctx, W, H, accent) {
  ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.85, 0, 40, W * 0.85, 0, W);
  g.addColorStop(0, accent + '55'); g.addColorStop(1, 'transparent');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
}
function fitText(ctx, text, max, w, px, min) {
  let s = px;
  ctx.font = font(w, s);
  while (s > min && ctx.measureText(text).width > max) { s -= 2; ctx.font = font(w, s); }
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
function drawSchedule(cv) {
  const W = 1080, H = 1350, ctx = cv.getContext('2d');
  backdrop(ctx, W, H, '#e54b2a');
  const from = weekStart(exportWeek), to = from + 7 * DAY;
  const list = (D.events || []).filter(e => e.at >= from && e.at < to && e.kind !== 'due').sort((a, b) => a.at - b.at);
  ctx.fillStyle = '#fff'; ctx.font = font(800, 76); ctx.fillText('جدول فعاليات النادي', W - 80, 170);
  ctx.fillStyle = '#e54b2a'; ctx.font = font(800, 34); ctx.fillText(fmtShort(from) + ' — ' + fmtShort(to - DAY), W - 80, 230);
  if (!list.length) {
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = font(400, 40); ctx.textAlign = 'center';
    ctx.fillText('لا فعاليات في هذا الأسبوع', W / 2, H / 2); ctx.textAlign = 'right';
  }
  let y = 320;
  const rowH = Math.min(150, (H - 420) / Math.max(list.length, 1));
  list.slice(0, 7).forEach(e => {
    const k = KIND[e.kind] || KIND.event;
    ctx.fillStyle = 'rgba(255,255,255,.06)'; roundRect(ctx, 80, y, W - 160, rowH - 18, 28); ctx.fill();
    ctx.fillStyle = k.c; roundRect(ctx, W - 92, y + 18, 12, rowH - 54, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, e.title, W - 470, 800, 44, 28), W - 124, y + rowH * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = font(400, 28);
    ctx.fillText(fitText(ctx, k.l + (e.place ? ' · ' + e.place : ''), W - 470, 400, 28, 20), W - 124, y + rowH * 0.42 + 44);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = font(800, 34);
    ctx.fillText(new Date(e.at).toLocaleDateString('ar-EG', { weekday: 'long' }), 124, y + rowH * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = font(400, 28);
    ctx.fillText(fmtShort(e.at) + ' · ' + fmtTime(e.at), 124, y + rowH * 0.42 + 44);
    ctx.textAlign = 'right';
    y += rowH;
  });
  footer(ctx, W, H);
}
function drawSession(cv, s) {
  const W = 1080, H = 1350, ctx = cv.getContext('2d');
  const k = KIND[s.kind === 'reading' ? 'reading' : 'radio'];
  backdrop(ctx, W, H, k.c);
  ctx.fillStyle = k.c; roundRect(ctx, W - 80 - 330, 120, 330, 72, 36); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = font(800, 36); ctx.textAlign = 'center';
  ctx.fillText(k.l, W - 80 - 165, 168); ctx.textAlign = 'right';
  ctx.font = font(800, 92);
  wrap(ctx, s.title || 'عنوان الجلسة', W - 80, 360, W - 160, 112, 3);
  const info = [s.host && ['🎙️', s.host], s.at && ['🗓️', fmtDay(s.at)], s.at && ['⏰', fmtTime(s.at)], s.place && ['📍', s.place], s.note && ['✦', s.note]].filter(Boolean);
  let y = 820;
  info.forEach(([ic, t]) => {
    ctx.font = font(400, 40); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(ic, W - 80, y);
    ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, t, W - 260, 800, 44, 28), W - 150, y);
    y += 80;
  });
  footer(ctx, W, H);
}
function footer(ctx, W, H) {
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(80, H - 140, W - 160, 2);
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = font(800, 32); ctx.fillText('نادي المدونة', W - 80, H - 80);
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = font(400, 26);
  ctx.fillText('غرفة العمليات 🚨', 80, H - 80); ctx.textAlign = 'right';
}
function wrap(ctx, text, x, y, max, lh, lines) {
  const words = text.split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > max && line) {
      if (++n === lines) { ctx.fillText(line + '…', x, y); return; }
      ctx.fillText(line, x, y); y += lh; line = w;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const exportName = () => (exportKind === 'schedule' ? 'جدول-الفعاليات-' + new Date(weekStart(exportWeek)).toISOString().slice(0, 10) : 'جلسة') + '.png';
const canvasBlob = () => new Promise(r => $('.op-canvas canvas').toBlob(r, 'image/png'));
async function exportSave() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await canvasBlob()); a.download = exportName(); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportSend(btn) {
  btn.disabled = true;
  const s = sessionFields();
  const fd = new FormData();
  fd.append('key', exportKind === 'schedule' ? 'schedule' : 'ready');
  fd.append('content', exportKind === 'schedule' ? '📆 **جدول فعاليات ' + (exportWeek ? 'الأسبوع القادم' : 'هذا الأسبوع') + '**'
    : '🎙️ **' + (s.title || 'جلسة') + '**' + (s.at ? '\n' + fmtDay(s.at) + ' — ' + fmtTime(s.at) : ''));
  fd.append('file', await canvasBlob(), exportName());
  try { const r = await api('post', { method: 'POST', form: fd }); toast(r.ok ? 'أُرسلت الصورة' : 'تعذّر الإرسال'); }
  catch (e) { toast(e.message); }
  btn.disabled = false;
}

/* ── الإعدادات ──────────────────────────────────────────────────────────── */
async function openSettings() {
  form = { type: 'settings' };
  const card = sheet();
  card.innerHTML = '<h3>الإعدادات</h3><div class="op-loader"><span></span><span></span><span></span></div>';
  try { guild = await api('guild'); } catch (e) { card.innerHTML = '<h3>الإعدادات</h3>' + empty(esc(e.message)); return; }
  if (!form || form.type !== 'settings') return;
  const s = D.settings, last = s.last_sync;
  const chOpts = sel => '<option value="">— لا ينشر —</option>' + guild.channels.map(c =>
    '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>#' + esc(c.name) + '</option>').join('');
  card.innerHTML =
    '<h3>الإعدادات</h3>' +
    '<fieldset><legend>رتب الإدارة — من يرى اللوحة كاملة</legend>' +
      '<p class="op-fine">من عنده Administrator أو Manage Server يدخل دائمًا.</p>' +
      '<div class="op-people" data-multi="admin_roles">' + guild.roles.map(r =>
        '<button type="button" data-mid="' + r.id + '" class="' + (s.admin_roles.includes(r.id) ? 'on' : '') + '" style="--rc:#' + (r.color || 0x99aab5).toString(16).padStart(6, '0') + '"><i class="op-rdot"></i><span>' + esc(r.name) + '</span></button>').join('') + '</div></fieldset>' +
    '<fieldset><legend>رومات الـ logs — التي يكتب فيها Carl-bot أو Sapphire</legend>' +
      '<div class="op-people" data-multi="log_channels">' + guild.channels.map(c =>
        '<button type="button" data-mid="' + c.id + '" class="' + (s.log_channels.includes(c.id) ? 'on' : '') + '"><span>#' + esc(c.name) + '</span></button>').join('') + '</div></fieldset>' +
    '<fieldset><legend>أين ينشر البوت</legend>' + POST_KEYS.map(([k, what, hint]) =>
      '<label>' + esc(what) + ' <i>(مثل ' + esc(hint) + ')</i><select name="ch_' + k + '">' + chOpts(s.channels[k]) + '</select></label>').join('') + '</fieldset>' +
    '<fieldset><legend>المزامنة</legend><p class="op-fine">' + (last ? 'آخر مزامنة ' + esc(fmtStamp(last.at)) + ' — ' +
      esc(Object.entries(last.out).map(([k, v]) => ({ members: 'الأعضاء', audit: 'التدقيق', channels: 'الرومات' })[k] + ': ' + v).join(' · ')) : 'لم تتم بعد') + '</p>' +
      '<div class="op-row"><button type="button" class="op-btn" data-act="sync">' + ICON.sync + '<b>مزامنة الآن</b></button>' +
      '<button type="button" class="op-btn" data-act="commands"><b>تسجيل أمر /اقتراح</b></button></div></fieldset>' +
    '<footer><button type="button" class="op-btn" data-act="close">إلغاء</button>' +
      '<button type="button" class="op-btn red" data-act="save-settings"><b>حفظ</b></button></footer>';
}
async function saveSettings(btn) {
  const c = $('.op-card');
  const pick = k => $$('[data-multi="' + k + '"] .on', c).map(b => b.dataset.mid);
  const channels = {};
  POST_KEYS.forEach(([k]) => { const v = $('[name="ch_' + k + '"]', c).value; if (v) channels[k] = v; });
  btn.disabled = true;
  try { await api('settings', { method: 'PUT', body: { admin_roles: pick('admin_roles'), log_channels: pick('log_channels'), channels } }); toast('حُفظت الإعدادات'); closeSheet(); await reload(); }
  catch (e) { btn.disabled = false; toast(e.message); }
}
async function syncNow(btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await api('sync', { method: 'POST' });
    const bad = Object.entries(r).filter(([, v]) => String(v).startsWith('error'));
    toast(bad.length ? 'تمت المزامنة مع أخطاء: ' + bad.map(([k]) => k).join('، ') : 'تمت المزامنة');
    if (form && form.type === 'settings') closeSheet();
    await reload();
  } catch (e) { toast(e.message); }
  if (btn) btn.disabled = false;
}

/* ------------------------------------------------------------ people pick -- */
function paintPick(which, into, list, scope) {
  const host = $('[data-pick="' + which + '"]', scope); if (!host) return;
  const q = (($('[data-q="' + which + '"]', scope) || {}).value || '').trim().toLowerCase();
  const people = (list || present()).filter(m => !q || (m.name + ' ' + (m.username || '')).toLowerCase().includes(q));
  host.innerHTML = people.map(m =>
    '<button type="button" data-pick-id="' + esc(m.id) + '" class="' + (into[m.id] ? 'on' : '') + '">' +
    '<img src="' + esc(m.avatar || avatarOf('')) + '" alt="" loading="lazy"><span>' + esc(m.name) + '</span></button>').join('') ||
    '<p class="op-fine">لا أحد بهذا الاسم.</p>';
}

/* ----------------------------------------------------------------- sheet -- */
function sheet() {
  const sh = $('.op-sheet');
  sh.hidden = false; void sh.offsetWidth; sh.classList.add('on');
  const card = $('.op-card', sh);
  card.scrollTop = 0;
  setTimeout(() => { const f = $('input:not([disabled]),textarea', card); if (f && matchMedia('(pointer:fine)').matches) f.focus(); }, 60);
  return card;
}
function closeSheet() {
  const sh = $('.op-sheet'); if (!sh) return;
  form = null;
  sh.classList.remove('on');
  setTimeout(() => { if (!form) sh.hidden = true; }, 240);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && form) closeSheet(); });

/* ---------------------------------------------------------------- events -- */
async function onClick(e) {
  if (e.target.classList.contains('op-sheet')) return closeSheet();
  const b = e.target.closest('button,a[data-act]'); if (!b) return;
  if (b.tagName === 'A') e.preventDefault();
  if (b.dataset.tab) { tab = b.dataset.tab; return paint(); }
  const seg = b.closest('[data-seg]');
  if (seg && b.dataset.v != null) {
    $$('button', seg).forEach(x => x.classList.toggle('on', x === b));
    if (seg.dataset.seg === 'xkind') { exportKind = b.dataset.v; return paint(); }
    if (seg.dataset.seg === 'xweek') { exportWeek = +b.dataset.v; return drawExport(); }
    if (seg.dataset.seg === 'pscope') { peopleScope = b.dataset.v; return paint(); }
    return;
  }
  if (b.dataset.pickId) {
    const id = b.dataset.pickId;
    const into = form && form.type === 'event' ? form.sups : ptSel;
    if (into[id]) delete into[id]; else into[id] = true;
    b.classList.toggle('on', !!into[id]);
    if (into === ptSel) {
      const go = $('[data-act="pt-go"]'); go.disabled = !Object.keys(ptSel).length; $('b', go).textContent = goLabel();
      $('[data-act="pt-none"]').hidden = !Object.keys(ptSel).length;
    } else paintRoles();
    return;
  }
  if (b.dataset.mid) { b.classList.toggle('on'); return; }
  if (b.dataset.ptk) { ptKind = b.dataset.ptk; $$('[data-ptk]').forEach(x => x.classList.toggle('on', x === b)); return; }
  if (b.dataset.amt) { ptAmt = +b.dataset.amt; $$('[data-amt]').forEach(x => x.classList.toggle('on', x === b)); $('.op-amt').value = ''; $('[data-act="pt-go"] b').textContent = goLabel(); return; }
  if (b.dataset.ltype != null) { logType = b.dataset.ltype; $$('[data-ltype]').forEach(x => x.classList.toggle('on', x === b)); return loadLogs(true); }

  const id = b.dataset.id;
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); await reload(); } catch (err) { toast(err.message); } };
  switch (b.dataset.act) {
    case 'logout': return logout();
    case 'close': return closeSheet();
    case 'settings': return openSettings();
    case 'save-settings': return saveSettings(b);
    case 'sync': return syncNow(b);
    case 'commands': try { await api('commands', { method: 'POST' }); toast('سُجّل الأمر /اقتراح'); } catch (err) { toast(err.message); } return;
    case 'new-event': return openEventForm(null);
    case 'edit-event': return openEventForm(id);
    case 'save-event': return saveEvent(b);
    case 'del-event':
      if (!confirm('حذف هذا الموعد؟')) return;
      closeSheet(); return run(() => api('events/' + form.id, { method: 'DELETE' }), 'حُذف');
    case 'add-task': form.tasks.push({ text: '', who: '', done: false }); paintTaskRows(); return $$('.op-trow input').pop().focus();
    case 'rm-task': form.tasks.splice(+b.dataset.i, 1); return paintTaskRows();
    case 'tick': return tick(id, b.dataset.t);
    case 'send-event': try { const r = await api('events/' + id + '/send', { method: 'POST' }); toast(r.ok ? 'أُرسل إلى الإشراف' : 'تعذّر الإرسال'); } catch (err) { toast(err.message); } return;
    case 'idea-reply': return run(() => api('ideas/' + id, { method: 'PATCH', body: { reply: $('.op-rin[data-id="' + id + '"]').value } }), 'حُفظ الرد');
    case 'idea-del': if (!confirm('حذف هذا المقترح؟')) return; return run(() => api('ideas/' + id, { method: 'DELETE' }));
    case 'pt-go': return givePoints();
    case 'pt-none': ptSel = {}; return paint();
    case 'pt-undo': if (!confirm('التراجع عن هذا التسجيل؟')) return; return run(() => api('points/' + id + '/undo', { method: 'POST' }), 'تم التراجع');
    case 'pt-adjust': return openAdjust(id);
    case 'pt-ledger': return openLedger(id);
    case 'save-adjust': return saveAdjust(b);
    case 'new-person': return openPersonForm(null);
    case 'edit-person': return openPersonForm(id);
    case 'save-person': return savePerson(b);
    case 'del-person': if (!confirm('حذف هذا العضو اليدوي؟')) return; { const pid = form.id; closeSheet(); return run(() => api('members/' + pid, { method: 'DELETE' }), 'حُذف'); }
    case 'new-log': return openLogForm(null);
    case 'edit-log': return openLogForm(id);
    case 'save-log': return saveLog(b, false);
    case 'hide-log': return saveLog(b, true);
    case 'logs-more': return loadLogs(false);
    case 'x-save': return exportSave();
    case 'x-send': return exportSend(b);
  }
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.act === 'idea-st') {
    api('ideas/' + t.dataset.id, { method: 'PATCH', body: { status: t.value } }).then(reload).catch(err => toast(err.message));
    return;
  }
  if (t.classList.contains('op-lmember')) { logMember = t.value; return loadLogs(true); }
  if (t.classList.contains('op-lhidden')) { logsHidden = t.checked; return loadLogs(true); }
  if (t.closest('[data-form="session"]')) {
    if (t.name === 'from' && t.value) {
      const ev = D.events.find(x => x.id === t.value), f = t.form;
      if (ev) {
        f.kind.value = ev.kind === 'reading' ? 'reading' : 'radio';
        f.at.value = localInput(ev.at); f.title.value = ev.title; f.place.value = ev.place || '';
        const s = Object.keys(ev.sups || {})[0]; f.host.value = s ? nameOf(s) : '';
      }
    }
    drawExport();
  }
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.role && form && form.sups[t.dataset.role]) { form.sups[t.dataset.role] = t.value.trim() || true; return; }
  if (t.closest('.op-trow')) { form.tasks[+t.closest('.op-trow').dataset.i][t.dataset.f] = t.value; return; }
  if (t.dataset.q === 'pts') return paintPick('pts', ptSel);
  if (t.dataset.q === 'sups') return paintPick('sups', form.sups);
  if (t.dataset.q === 'people') {
    peopleQ = t.value;
    const pos = t.selectionStart;
    paint();
    const n = $('[data-q="people"]'); n.focus(); n.setSelectionRange(pos, pos);
    return;
  }
  if (t.classList.contains('op-amt')) {
    const v = parseInt(latin(t.value), 10);
    if (v > 0) { ptAmt = Math.min(v, 500); $$('[data-amt]').forEach(x => x.classList.remove('on')); $('[data-act="pt-go"] b').textContent = goLabel(); }
    return;
  }
  if (t.closest('[data-form="session"]')) drawExport();
}
function onSubmit(e) {
  e.preventDefault();
  if (e.target.dataset.form === 'idea') sendIdea(e.target);
}

/* ------------------------------------------------------------------ boot -- */
takeTokenFromHash();
if (!token) paintLogin();
else {
  $('#app').innerHTML = '<div class="op-loader boot"><span></span><span></span><span></span></div>';
  reload().catch(() => {});
}
