-- Schoolink v2 · D1 schema（全部幂等，重跑不会失败）

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  student_id   TEXT NOT NULL,
  display_name TEXT NOT NULL,
  about        TEXT NOT NULL DEFAULT '',
  avatar_key   TEXT,
  role         TEXT NOT NULL DEFAULT 'user',
  banned       INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL DEFAULT 0,
  show_online  INTEGER NOT NULL DEFAULT 1,
  read_receipts INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS threads (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,              -- direct | group
  name            TEXT,
  about           TEXT NOT NULL DEFAULT '',  -- 群公告
  avatar_key      TEXT,
  direct_key      TEXT UNIQUE,
  is_default      INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL DEFAULT 0,
  accent           TEXT,
  announcement_only  INTEGER NOT NULL DEFAULT 0,
  members_can_invite INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC);

CREATE TABLE IF NOT EXISTS thread_members (
  thread_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  joined_at    INTEGER NOT NULL,
  last_read_at INTEGER NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  muted        INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  starred      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tm_user ON thread_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  thread_id      TEXT NOT NULL,
  sender_id      TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'text',  -- text | image | file | audio | system
  body           TEXT NOT NULL DEFAULT '',
  media_key      TEXT,
  media_name     TEXT,
  media_size     INTEGER,
  media_type     TEXT,
  duration       INTEGER,
  reply_to       TEXT,
  forwarded_from TEXT,
  edited_at      INTEGER,
  deleted_at     INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_thread_time ON messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);

CREATE TABLE IF NOT EXISTS starred (
  user_id    TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_starred_user ON starred(user_id, created_at DESC);
