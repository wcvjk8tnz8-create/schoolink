"use client";

/**
 * Schoolink 自定义中心。
 * 个人 / 群组资料存 D1（换设备也在），外观与输入习惯存本机 localStorage。
 * 三语文案按当前语言即时切换，不依赖字典键。
 */
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { Avatar, IconButton } from "./ui";
import { AvatarPicker, AvatarVisual } from "./AvatarPicker";
import { Icon } from "./Icon";
import { ACCENTS, WALLPAPERS, FONTS, THREAD_ACCENTS, usePrefs, muteOptions, type ClockKey, type WallpaperKey, type FontKey, type AccentKey } from "@/lib/prefs";
import { LANGS, LANG_LABEL } from "@/lib/i18n";
import type { Lang, Theme, Thread } from "@/lib/types";
import { cx } from "@/lib/utils";

type Lang3 = Lang;
function L(lang: Lang3, cn: string, hk: string, en: string): string {
  return lang === "en" ? en : lang === "zh-HK" ? hk : cn;
}

function Switch({ on, onChange, label, hint }: {
  on: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <button className="pref-row" onClick={() => onChange(!on)}>
      <span className="pref-label"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <motion.span className={cx("switch", on && "on")} layout>
        <motion.i layout transition={{ type: "spring", stiffness: 500, damping: 32 }} />
      </motion.span>
    </button>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="pref-section">
      <h3><Icon name={icon} size={15} /> {title}</h3>
      {children}
    </section>
  );
}

function Pills<T extends string>({ value, options, onChange }: {
  value: T; options: readonly { key: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="pref-pills">
      {options.map((o) => (
        <button key={o.key} className={cx(value === o.key && "on")}
          onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

/* ─────────────────────────── 个人资料 ─────────────────────────── */

export function ProfileCustomize() {
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me);
  const [name, setName] = useState(me?.display_name || "");
  const [about, setAbout] = useState(me?.about || "");
  const [avatar, setAvatar] = useState<string | null>(me?.avatar_key || null);
  const [showOnline, setShowOnline] = useState(me?.show_online !== false);
  const [readReceipts, setReadReceipts] = useState(me?.read_receipts !== false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await useApp.getState().updateProfile({
        display_name: name, about, avatar_key: avatar,
        show_online: showOnline, read_receipts: readReceipts,
      });
      useApp.getState().toastMsg(L(lang, "资料已保存", "資料已儲存", "Profile saved"), "ok");
    } catch (e) {
      useApp.getState().toastMsg((e as Error).message, "err");
    } finally { setBusy(false); }
  };

  return (
    <div className="pref-body">
      <Section title={L(lang, "头像", "頭像", "Avatar")} icon="smile">
        <AvatarPicker value={avatar} label={name || me?.display_name || "?"} onChange={setAvatar} />
      </Section>
      <Section title={L(lang, "基本资料", "基本資料", "Details")} icon="edit">
        <div className="field"><label>{L(lang, "显示名", "顯示名", "Display name")}</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>{L(lang, "关于 / 状态", "關於 / 狀態", "About")}</label>
          <input value={about} maxLength={140} placeholder={L(lang, "写点什么…", "寫啲嘢…", "Say something…")}
            onChange={(e) => setAbout(e.target.value)} /></div>
      </Section>
      <Section title={L(lang, "隐私", "私隱", "Privacy")} icon="lock">
        <Switch on={showOnline} onChange={setShowOnline}
          label={L(lang, "显示在线状态", "顯示在線狀態", "Show online status")}
          hint={L(lang, "关闭后别人只看到「最后上线」", "關閉後別人只見到「最後上線」", "Others will only see last seen")} />
        <Switch on={readReceipts} onChange={setReadReceipts}
          label={L(lang, "已读回执", "已讀回執", "Read receipts")}
          hint={L(lang, "关闭后双方都看不到蓝色双勾", "關閉後雙方都見唔到藍色雙勾", "Disables blue ticks both ways")} />
      </Section>
      <button className="btn primary big full" disabled={busy} onClick={save}>
        {busy ? L(lang, "保存中…", "儲存中…", "Saving…") : L(lang, "保存资料", "儲存資料", "Save profile")}
      </button>
    </div>
  );
}

/* ─────────────────────────── 群组自定义 ─────────────────────────── */

export function GroupCustomize({ thread, showMembers = true }: { thread: Thread; showMembers?: boolean }) {
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me);
  const isAdmin = useApp((s) => s.isAdmin);
  const cfg = useApp((s) => s.config);
  const canEdit = thread.created_by === me?.id || isAdmin || Boolean(thread.is_default);
  const [name, setName] = useState(thread.name || "");
  const [about, setAbout] = useState(thread.about || "");
  const [avatar, setAvatar] = useState<string | null>(thread.avatar_key || null);
  const [accent, setAccent] = useState(thread.accent || "violet");
  const [announcementOnly, setAnnouncementOnly] = useState(Boolean(thread.announcement_only));
  const [membersCanInvite, setMembersCanInvite] = useState(thread.members_can_invite !== 0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await useApp.getState().updateGroup({
        name, about, avatar_key: avatar, accent,
        announcement_only: announcementOnly, members_can_invite: membersCanInvite,
      });
      useApp.getState().toastMsg(L(lang, "群组设定已保存", "群組設定已儲存", "Group settings saved"), "ok");
    } catch (e) {
      useApp.getState().toastMsg((e as Error).message, "err");
    } finally { setBusy(false); }
  };

  return (
    <div className="pref-body">
      {!canEdit && <div className="notice"><Icon name="info" size={14} /> {L(lang,
        "只有群主或管理员可以修改群组设定", "只有群主或管理員可以修改群組設定",
        "Only the group owner or an admin can edit group settings")}</div>}

      <Section title={L(lang, "群组头像", "群組頭像", "Group avatar")} icon="image">
        <AvatarPicker value={avatar} label={name || "G"} onChange={setAvatar} />
      </Section>

      <Section title={L(lang, "群组资料", "群組資料", "Group details")} icon="edit">
        <div className="field"><label>{L(lang, "群名称", "群名稱", "Group name")}</label>
          <input value={name} maxLength={60} disabled={!canEdit} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>{L(lang, "群公告（会置顶在聊天上方）", "群公告（會置頂在聊天上方）", "Group notice (pinned above chat)")}</label>
          <textarea value={about} maxLength={300} rows={2} disabled={!canEdit}
            placeholder={L(lang, "例如：明天小息交专题报告", "例如：聽日小息交專題報告", "e.g. Project due tomorrow")}
            onChange={(e) => setAbout(e.target.value)} /></div>
      </Section>

      <Section title={L(lang, "群组主题色", "群組主題色", "Group colour")} icon="star">
        <div className="accent-row">
          {ACCENTS.map((a) => (
            <motion.button key={a.key} className={cx("accent-dot", accent === a.key && "on")}
              style={{ background: a.hex }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
              disabled={!canEdit} onClick={() => setAccent(a.key)} title={a.label} />
          ))}
        </div>
      </Section>

      <Section title={L(lang, "群组权限", "群組權限", "Group permissions")} icon="users">
        <Switch on={announcementOnly} onChange={setAnnouncementOnly}
          label={L(lang, "仅群主/管理员可发言", "僅群主/管理員可發言", "Only owner/admins can post")}
          hint={L(lang, "适合做公告频道", "適合做公告頻道", "Turn the group into an announcement channel")} />
        <Switch on={membersCanInvite} onChange={setMembersCanInvite}
          label={L(lang, "成员可邀请新同学", "成員可邀請新同學", "Members can add people")}
          hint={L(lang, "关闭后只有群主/管理员能加人", "關閉後只有群主/管理員能加人", "Only owner/admins can add members")} />
      </Section>

      {canEdit && <button className="btn primary big full" disabled={busy} onClick={save}>
        {busy ? L(lang, "保存中…", "儲存中…", "Saving…") : L(lang, "保存群组设定", "儲存群組設定", "Save group settings")}
      </button>}

      {showMembers && (
        <Section title={L(lang, "成员", "成員", "Members")} icon="users">
          <div className="member-list compact-list">
            {thread.members.map((m) => (
              <div key={m.id} className="member-row">
                <Avatar user={m} size={30} />
                <div><strong>{m.display_name}</strong><small>{m.student_id}</small></div>
              </div>
            ))}
          </div>
          <div className="pref-inline">
            {membersCanInvite || canEdit ? (
              <button className="btn small" onClick={() => useApp.getState().setModal("members")}>
                <Icon name="plus" size={14} /> {L(lang, "加成员", "加成員", "Add members")}
              </button>
            ) : null}
            {!thread.is_default && (
              <button className="btn danger small" onClick={() => useApp.getState().leave()}>
                <Icon name="logout" size={14} /> {L(lang, "退群", "退群", "Leave group")}
              </button>
            )}
          </div>
        </Section>
      )}

      {cfg.r2Enabled === false && <p className="muted-line">{L(lang,
        "提示：启用 R2 后还可上传自定义群头像图片", "提示：啟用 R2 後仲可以上載自訂群頭像圖片",
        "Tip: enable R2 to upload custom group avatar images")}</p>}
      {thread.accent && (
        <div className="thread-accent-preview" style={{ borderColor: THREAD_ACCENTS[thread.accent] }}>
          <AvatarVisual value={avatar} label={name || "G"} size={36} base={cfg.r2PublicBaseUrl} />
          <span>{L(lang, "当前主题色预览", "目前主題色預覽", "Current group colour")}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 外观 / 效率 ─────────────────────────── */

function AppearancePrefs() {
  const lang = useApp((s) => s.lang);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const setLang = useApp((s) => s.setLang);
  const p = usePrefs();

  return (
    <div className="pref-body">
      <Section title={L(lang, "语言", "語言", "Language")} icon="globe">
        <Pills value={lang} options={LANGS.map((l) => ({ key: l, label: LANG_LABEL[l] }))} onChange={setLang} />
      </Section>
      <Section title={L(lang, "主题", "主題", "Theme")} icon="moon">
        <Pills<Theme> value={theme} options={([
          { key: "dark", label: L(lang, "深色", "深色", "Dark") },
          { key: "light", label: L(lang, "浅色", "淺色", "Light") },
          { key: "system", label: L(lang, "跟随系统", "跟隨系統", "System") },
        ] as { key: Theme; label: string }[])} onChange={setTheme} />
      </Section>
      <Section title={L(lang, "强调色", "強調色", "Accent colour")} icon="star">
        <div className="accent-row big">
          {ACCENTS.map((a) => (
            <motion.button key={a.key} className={cx("accent-dot", p.accent === a.key && "on")}
              style={{ background: a.hex }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
              onClick={() => p.patch("accent", a.key)} title={a.label} />
          ))}
        </div>
      </Section>
      <Section title={L(lang, "聊天壁纸", "聊天壁紙", "Chat wallpaper")} icon="image">
        <Pills<WallpaperKey> value={p.wallpaper}
          options={WALLPAPERS as { key: WallpaperKey; label: string }[]}
          onChange={(v) => p.patch("wallpaper", v)} />
        <div className="wall-preview" data-wp={p.wallpaper}><span className="wp-bubble" /> <span className="wp-bubble mine" /></div>
      </Section>
      <Section title={L(lang, "文字与密度", "文字與密度", "Text & density")} icon="edit">
        <div className="pref-sub">{L(lang, "字号", "字號", "Font size")}</div>
        <Pills<FontKey> value={p.font}
          options={FONTS as { key: FontKey; label: string }[]}
          onChange={(v) => p.patch("font", v)} />
        <Switch on={p.compact} onChange={(v) => p.patch("compact", v)}
          label={L(lang, "紧凑模式", "緊湊模式", "Compact mode")} />
        <div className="pref-sub">{L(lang, "时间格式", "時間格式", "Time format")}</div>
        <Pills<ClockKey> value={p.clock} options={([
          { key: "24h", label: "24h" }, { key: "12h", label: "12h" },
        ] as { key: ClockKey; label: string }[])} onChange={(v) => p.patch("clock", v)} />
      </Section>
      <Section title={L(lang, "动效", "動效", "Motion")} icon="bolt">
        <Switch on={p.animations} onChange={(v) => p.patch("animations", v)}
          label={L(lang, "界面动画", "介面動畫", "Interface animations")}
          hint={L(lang, "系统设为减少动态时也会自动关闭", "系統設為減少動態時亦會自動關閉", "Auto-disabled when your system prefers reduced motion")} />
      </Section>
    </div>
  );
}

function ToolsPrefs() {
  const lang = useApp((s) => s.lang);
  const p = usePrefs();
  const activeId = useApp((s) => s.activeId);
  const [phrase, setPhrase] = useState("");
  const [muteOpen, setMuteOpen] = useState(false);

  const askNotification = async (on: boolean) => {
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* noop */ }
    }
    p.patch("notifications", on);
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      useApp.getState().toastMsg(L(lang, "浏览器未授予通知权限", "瀏覽器未授予通知權限", "Notification permission not granted"), "err");
    }
  };

  return (
    <div className="pref-body">
      <Section title={L(lang, "输入习惯", "輸入習慣", "Typing")} icon="edit">
        <Switch on={p.sendWithEnter} onChange={(v) => p.patch("sendWithEnter", v)}
          label={L(lang, "Enter 发送", "Enter 傳送", "Enter to send")}
          hint={L(lang, "关闭后改用 Ctrl/⌘ + Enter，Enter 换行", "關閉後改用 Ctrl/⌘ + Enter，Enter 換行", "Off = Ctrl/⌘ + Enter sends, Enter adds a line")} />
      </Section>

      <Section title={L(lang, "快捷短语", "快捷短語", "Quick phrases")} icon="bolt">
        <p className="muted-line">{L(lang, "在输入框一键插入常用句子，最多 24 条", "喺輸入框一鍵插入常用句子，最多 24 條", "Insert frequent lines with one tap, up to 24")}</p>
        <div className="phrase-list">
          <AnimatePresence initial={false}>
            {p.quickPhrases.map((s, i) => (
              <motion.div key={`${i}-${s}`} className="phrase-row"
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
                <span>{s}</span>
                <button className="mini danger" onClick={() => p.removePhrase(i)}><Icon name="close" size={13} /></button>
              </motion.div>
            ))}
          </AnimatePresence>
          {!p.quickPhrases.length && <div className="muted-line">{L(lang, "还没有快捷短语", "仲未設快捷短語", "No quick phrases yet")}</div>}
        </div>
        <div className="pref-inline">
          <input value={phrase} maxLength={120} placeholder={L(lang, "新增短语…", "新增短語…", "Add a phrase…")}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { p.addPhrase(phrase); setPhrase(""); } }} />
          <button className="btn small" disabled={!phrase.trim()} onClick={() => { p.addPhrase(phrase); setPhrase(""); }}>
            <Icon name="plus" size={14} /> {L(lang, "添加", "新增", "Add")}
          </button>
        </div>
      </Section>

      <Section title={L(lang, "通知", "通知", "Notifications")} icon="bell-off">
        <Switch on={p.notifications} onChange={askNotification}
          label={L(lang, "桌面通知", "桌面通知", "Desktop notifications")}
          hint={L(lang, "仅在页面切到后台且收到新消息时提醒", "只喺頁面切到背景且收到新訊息時提醒", "Only when the app is in the background")} />
        {activeId && (
          <div className="mute-block">
            <button className="btn small" onClick={() => setMuteOpen((v) => !v)}>
              <Icon name="bell-off" size={14} /> {p.isMuted(activeId)
                ? L(lang, "已静音（点击更改）", "已靜音（點擊更改）", "Muted (tap to change)")
                : L(lang, "静音此会话", "靜音此對話", "Mute this chat")}
            </button>
            <AnimatePresence>
              {muteOpen && (
                <motion.div className="mute-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}>
                  {muteOptions().map((o) => (
                    <button key={o.until} onClick={() => {
                      p.setMute(activeId, o.until);
                      useApp.getState().setFlags(activeId, { muted: true });
                      setMuteOpen(false);
                    }}>{o.label}</button>
                  ))}
                  <button className="danger" onClick={() => {
                    p.setMute(activeId, 0);
                    useApp.getState().setFlags(activeId, { muted: false });
                    setMuteOpen(false);
                  }}>{L(lang, "取消静音", "取消靜音", "Unmute")}</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </Section>

      <Section title={L(lang, "备份偏好", "備份偏好", "Backup preferences")} icon="download">
        <p className="muted-line">{L(lang,
          "外观与快捷短语保存在这台设备；群组与个人资料保存在学校服务器，换设备仍在。",
          "外觀與快捷短語儲喺呢部裝置；群組同個人資料存喺學校伺服器，換機都仲喺度。",
          "Appearance and quick phrases live on this device; group and profile data live on the school server.")}</p>
        <button className="btn small" onClick={() => {
          const keys = Object.keys(localStorage).filter((k) => k.startsWith("schoolink."));
          const data = Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)]));
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "schoolink-prefs.json";
          a.click();
          URL.revokeObjectURL(a.href);
        }}><Icon name="download" size={14} /> {L(lang, "导出本机偏好", "匯出本機偏好", "Export local preferences")}</button>
      </Section>
    </div>
  );
}

/* ─────────────────────────── 设置中心外壳 ─────────────────────────── */

type Tab = "profile" | "group" | "appearance" | "tools";

export default function Customize() {
  const lang = useApp((s) => s.lang);
  const [tab, setTab] = useState<Tab>("profile");
  const thread = useApp((s) => s.threads.find((x) => x.id === s.activeId));
  const group = thread?.type === "group" ? thread : null;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "profile", label: L(lang, "个人", "個人", "Profile"), icon: "smile" },
    { key: "group", label: L(lang, "群组", "群組", "Group"), icon: "users" },
    { key: "appearance", label: L(lang, "外观", "外觀", "Look"), icon: "sun" },
    { key: "tools", label: L(lang, "效率", "效率", "Tools"), icon: "bolt" },
  ];

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => useApp.getState().setModal(null)}>
      <motion.div className="modal wide customize-modal"
        initial={{ opacity: 0, scale: 0.92, y: 22 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2><Icon name="settings" size={17} /> {L(lang, "自定义", "自訂", "Customize")}</h2>
          <IconButton onClick={() => useApp.getState().setModal(null)}><Icon name="close" size={16} /></IconButton>
        </div>
        <div className="customize-tabs">
          {tabs.map((x) => (
            <button key={x.key} className={cx(tab === x.key && "on")} onClick={() => setTab(x.key)}>
              <Icon name={x.icon} size={15} /> {x.label}
              {tab === x.key && <motion.i layoutId="ct-active" className="ct-active" />}
            </button>
          ))}
        </div>
        <div className="modal-body customize-body">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {tab === "profile" && <ProfileCustomize />}
              {tab === "group" && (group ? <GroupCustomize thread={group} /> : (
                <div className="notice"><Icon name="info" size={14} /> {L(lang,
                  "先打开一个群聊，就能自定义群头像、公告、主题色与权限。",
                  "先打開一個群聊，就可以自訂群頭像、公告、主題色同權限。",
                  "Open a group chat to customise its avatar, notice, colour and permissions.")}</div>
              ))}
              {tab === "appearance" && <AppearancePrefs />}
              {tab === "tools" && <ToolsPrefs />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
