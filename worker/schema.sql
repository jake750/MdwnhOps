-- غرفة العمليات — D1 schema. Apply with:
--   npx wrangler d1 execute mdwnh-ops --file=schema.sql --remote   (production)
--   npx wrangler d1 execute mdwnh-ops --file=schema.sql --local    (dev)

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- JSON
);

-- Server members. Synced from Discord every few minutes; the manual columns
-- (note, status, label) belong to the admins and a sync never overwrites them.
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY,   -- Discord user id, or 'm_…' for a manual entry
  username   TEXT,
  name       TEXT,               -- server nickname › global name › username
  avatar     TEXT,               -- full CDN url
  roles      TEXT DEFAULT '[]',  -- JSON array of role ids
  joined_at  INTEGER,
  in_server  INTEGER DEFAULT 1,
  left_at    INTEGER,
  is_bot     INTEGER DEFAULT 0,
  manual     INTEGER DEFAULT 0,  -- added by hand, not by the sync
  note       TEXT,
  status     TEXT,               -- manual override: active | quiet | left
  label      TEXT,               -- manual role label: مدوّن، مستمع…
  synced_at  INTEGER,
  updated_at INTEGER,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'event',
  at         INTEGER NOT NULL,
  end_at     INTEGER,
  place      TEXT,
  note       TEXT,
  sups       TEXT DEFAULT '{}',  -- JSON {memberId: role|true}
  tasks      TEXT DEFAULT '{}',  -- JSON {taskId: {text, who, done, doneBy}}
  created_by TEXT,
  created_at INTEGER,
  updated_by TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS ideas (
  id        TEXT PRIMARY KEY,
  text      TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'idea',   -- idea | note
  anon      INTEGER DEFAULT 0,
  by_id     TEXT,
  at        INTEGER NOT NULL,
  status    TEXT DEFAULT 'new',             -- new | study | ok | no
  reply     TEXT,
  reply_by  TEXT,
  source    TEXT DEFAULT 'site'             -- site | discord
);

-- Server points. One row per member per write; a balance is SUM(amount)
-- over rows that are not undone. Manual corrections are rows too (kind='adjust').
CREATE TABLE IF NOT EXISTS points (
  id        TEXT PRIMARY KEY,
  batch     TEXT NOT NULL,       -- one give to several members shares a batch
  member_id TEXT NOT NULL,
  amount    INTEGER NOT NULL,
  kind      TEXT NOT NULL,       -- stars | tilawa | train | init | adjust
  note      TEXT,
  by_id     TEXT,
  at        INTEGER NOT NULL,
  undone    INTEGER DEFAULT 0,
  undone_by TEXT
);
CREATE INDEX IF NOT EXISTS points_member ON points(member_id);
CREATE INDEX IF NOT EXISTS points_batch ON points(batch);

-- Logs: Discord's audit log, the log channels other bots write to, and
-- entries typed in by hand. `ref` is the source's own id so a sync never
-- stores the same entry twice.
CREATE TABLE IF NOT EXISTS logs (
  id        TEXT PRIMARY KEY,
  source    TEXT NOT NULL,       -- audit | channel | manual
  ref       TEXT UNIQUE,
  type      TEXT NOT NULL,       -- join | leave | ban | unban | kick | timeout | role | nick | msg_delete | msg_edit | channel | other
  actor_id  TEXT,
  target_id TEXT,
  summary   TEXT NOT NULL,
  detail    TEXT,
  channel   TEXT,
  at        INTEGER NOT NULL,
  hidden    INTEGER DEFAULT 0,
  edited_by TEXT
);
CREATE INDEX IF NOT EXISTS logs_at ON logs(at);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
