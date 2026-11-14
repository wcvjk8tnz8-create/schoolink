export type Lang = "zh-CN" | "zh-HK" | "en";
export type Theme = "dark" | "light" | "system";

export interface User {
  id: string;
  email: string;
  student_id: string;
  display_name: string;
  about: string;
  avatar_key: string | null;
  role: string;
  banned: boolean;
  created_at: number;
  last_seen: number;
  show_online: boolean;
  read_receipts: boolean;
  class_name: string;
  student_no: string;
  email_bound: boolean;
  has_password: boolean;
}

export interface Thread {
  id: string;
  type: "direct" | "group";
  name: string | null;
  about: string;
  avatar_key: string | null;
  is_default: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  last_message_at: number;
  last_body: string | null;
  last_kind: string | null;
  last_sender: string | null;
  last_at: number | null;
  unread: number;
  pinned: number;
  muted: number;
  archived: number;
  starred: number;
  last_read_at: number;
  accent: string | null;
  announcement_only: number;
  members_can_invite: number;
  members: User[];
  online: boolean;
}

export interface Reaction {
  emoji: string;
  user_id: string;
  display_name: string;
}

export interface ReplyPreview {
  id: string;
  sender_id: string;
  body: string;
  kind: string;
  display_name: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  kind: "text" | "image" | "file" | "audio" | "system";
  body: string;
  media_key: string | null;
  media_name: string | null;
  media_size: number | null;
  media_type: string | null;
  duration: number | null;
  reply_to: string | null;
  forwarded_from: string | null;
  edited_at: number | null;
  deleted_at: number | null;
  created_at: number;
  reactions: Reaction[];
  starred: boolean;
  reply?: ReplyPreview | null;
  pending?: boolean;
  failed?: boolean;
}

export interface Config {
  domains: string[];
  r2PublicBaseUrl: string;
  schoolName: string;
  adminEmails?: string[];
  mailFrom?: string;
  mailApiBase?: string;
  mailApiTokenMasked?: string;
  mailSource?: "panel" | "secret" | "none";
  mailConfigured: boolean;
  adminPasswordSet?: boolean;
  devOtp?: boolean;
  r2Enabled: boolean;
  requireBoundEmail?: boolean;
  aiEnabled?: boolean;
  updatedAt?: number | null;
}

export interface Stats { users: number; threads: number; messages: number }

export type WsEvent =
  | { type: "hello" | "pong"; at: number }
  | { type: "message" | "message-updated"; threadId: string; message: Message }
  | { type: "read"; threadId: string; userId: string; at: number }
  | { type: "typing"; threadId: string; userId: string; displayName: string; on: boolean }
  | { type: "thread-new" | "thread-updated"; threadId: string };

export type Modal =
  | null | "new-chat" | "profile" | "settings" | "group-info"
  | "starred" | "search" | "lightbox" | "emoji" | "forward" | "members";

export interface Toast { id: number; text: string; kind: "ok" | "err" | "info" }

export type Filter = "all" | "unread" | "groups" | "archived" | "starred";
