/* Small D1 helpers shared by the API and the cron. */
export const uid = () => Date.now().toString(36) + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);

export async function getSetting(env, key) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r ? JSON.parse(r.value) : null;
}
export const setSetting = (env, key, value) =>
  env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, JSON.stringify(value)).run();

/* JSON columns come back as strings; the site wants objects. */
export const parseRow = (row, cols) => {
  if (!row) return row;
  for (const c of cols) if (typeof row[c] === 'string') { try { row[c] = JSON.parse(row[c]); } catch (e) {} }
  return row;
};
