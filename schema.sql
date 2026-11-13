-- Schoolink D1 schema
-- 账号数据 + 聊天数据全部持久化在这里；KV 只做缓存 / 会话 / 配置。
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  student_id    TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_key    TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_student ON users(student_id);

CREATE TABLE IF NOT EXISTS threads (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL DEFAULT 'direct',   -- direct | group
  name          TEXT,
  avatar_key    TEXT,
  direct_key    TEXT UNIQUE,                      -- 私聊去重：两个 uid 排序后拼接
  is_default    INTEGER NOT NULL DEFAULT 0,      -- 全校广场
  created_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_default ON threads(is_default) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS thread_members (
  thread_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  joined_at     INTEGER NOT NULL,
  last_read_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tm_user ON thread_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  sender_id     TEXT NOT NULL,                   -- 'system' 为系统提示
  kind          TEXT NOT NULL DEFAULT 'text',   -- text | image | system
  body          TEXT,                           -- 文本 或 图片公网 URL
  image_key     TEXT,                           -- R2 object key
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_thread_time ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_id);
