"use client";
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiPost } from "@/lib/api/client";
import type { AccountPayload, AllianceInvitationRow, ChannelRow, NotificationRow } from "@/lib/api/types";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { PresenceList } from "./PresenceList";
import { ChannelUtilityPanel } from "./ChannelUtilityPanel";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";

export function ChatPanel({ alliance }: { alliance: string }) {
  const { t, locale } = useTranslation();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [selected, setSelected] = useState<ChannelRow | null>(null);
  const [workspace, setWorkspace] = useState("community");
  const [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [invitations, setInvitations] = useState<AllianceInvitationRow[]>([]);
  const [showInbox, setShowInbox] = useState(false);
  const [hasAlliance, setHasAlliance] = useState(false);
  const [messageVersion, setMessageVersion] = useState(0);
  const [accountEmail, setAccountEmail] = useState("");
  const [utility, setUtility] = useState<"search" | "pins" | null>(null);

  const refreshAccount = useCallback(async () => {
    const { data } = await api<AccountPayload>("/api/account");
    if (!data) return;
    setAccountEmail(data.email || "Signed in");
    setNotifications(data.notifications);
    setInvitations(data.invitations);
    setHasAlliance(data.has_alliance);
  }, []);

  useEffect(() => {
    api<{ channels: ChannelRow[] }>("/api/channels").then(({ data }) => {
      const available = data?.channels ?? [];
      setChannels(available);
      const requestedId = new URLSearchParams(window.location.search).get("channel");
      const requested = available.find((channel) => channel.id === requestedId);
      if (requested) {
        setWorkspace(requested.scope === "community" ? "community" : requested.alliance ?? "community");
        setSelected(requested);
      }
    });
    refreshAccount();
  }, [refreshAccount]);

  async function signOut() {
    await apiPost("/api/auth/signout", {});
    window.location.assign("/chat");
  }

  function jumpToMessage(messageId: string) {
    setUtility(null);
    window.requestAnimationFrame(() => document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  const visible = useMemo(() => channels.filter((channel) =>
    workspace === "community" ? channel.scope === "community" : channel.alliance === workspace,
  ), [channels, workspace]);

  useEffect(() => {
    if (!selected || !visible.some((channel) => channel.id === selected.id)) setSelected(visible[0] ?? null);
  }, [visible, selected]);

  useEffect(()=>{
    const messageId=new URLSearchParams(window.location.search).get("message");
    if(!selected||!messageId)return;
    const timer=window.setTimeout(()=>document.getElementById(`message-${messageId}`)?.scrollIntoView({behavior:"smooth",block:"center"}),500);
    return()=>window.clearTimeout(timer);
  },[selected,messageVersion]);

  const unread = notifications.filter((note) => !note.read_at).length;

  async function markRead(note: NotificationRow) {
    if (note.read_at) return;
    await apiPost(`/api/notifications/${note.id}/read`, {});
    setNotifications((all) => all.map((item) => item.id === note.id
      ? { ...item, read_at: new Date().toISOString() } : item));
  }

  async function respond(invite: AllianceInvitationRow, accept: boolean) {
    await apiPost(`/api/invitations/${invite.id}/respond`, { accept });
    await refreshAccount();
  }

  return (
    <div className="chat-frame">
      <nav className="space-rail" aria-label={t("Spaces")}>
        <div className="brand-orb"><img src="/images/burnfire/logo.png" alt={t("BurnFire")} /></div>
        <span className="rail-divider" />
        <button title={t("Last Asylum Community")} onClick={() => { setWorkspace("community"); setShowInbox(false); }} className={`space-button ${workspace === "community" && !showInbox ? "is-active" : ""}`}><Text>{"LA"}</Text></button>
        {hasAlliance && <button title={t("BurnFire Alliance")} onClick={() => { setWorkspace(alliance); setShowInbox(false); }} className={`space-button space-button-fire ${workspace === alliance && !showInbox ? "is-active" : ""}`}><Text>{"BF"}</Text></button>}
        <button title={t("Inbox")} onClick={() => setShowInbox((value) => !value)} className={`space-button inbox-button ${showInbox ? "is-active" : ""}`}><span aria-hidden="true">✦</span>{unread > 0 && <span className="unread-badge">{<LocalizedNumber value={unread} />}</span>}</button>
      </nav>

      <aside className="channel-rail">
        <LanguageSelector />
        <div className="channel-brand"><span className="eyebrow"><Text>{"Kingdom #324"}</Text></span><strong>{workspace === "community" ? t("Last Asylum") : t("BurnFire")}</strong><span>{workspace === "community" ? t("Community network") : t("Alliance command")}</span></div>
        <div className="channel-heading"><span><Text>{"Channels"}</Text></span><span>⌁</span></div>
        <div className="channel-list">{visible.map((channel) => <button key={channel.id} onClick={() => { setSelected(channel); setReplyTo(null); setShowInbox(false); }} className={`channel-button ${selected?.id === channel.id && !showInbox ? "is-active" : ""}`}><span className="hash">#</span><span>{t(channel.name)}</span></button>)}</div>
        <div className="hosted-by"><span className="status-dot" /><span><strong><Text>{"BurnFire Alliance"}</Text></strong><small><Text>{"Unofficial community host"}</Text></small></span></div>
      </aside>

      {showInbox ? <section className="inbox-panel">
        <header className="chat-topbar"><div><span className="eyebrow"><Text>{"Private to you"}</Text></span><h2><Text>{"Signal inbox"}</Text></h2></div><button onClick={() => setShowInbox(false)} className="ghost-button"><Text>{"Close"}</Text></button></header>
        <div className="inbox-content">
          {invitations.map((invite) => <article key={invite.id} className="notice-card invite-card"><span className="notice-icon">🔥</span><div><strong><Text>{"Alliance invitation"}</Text></strong><p><Text values={{ value1: String(invite.game_rank.toUpperCase() ?? "") }}>{"You were invited with rank {value1}."}</Text></p></div><div className="notice-actions"><button onClick={() => respond(invite, true)} className="ember-button"><Text>{"Accept"}</Text></button><button onClick={() => respond(invite, false)} className="ghost-button"><Text>{"Decline"}</Text></button></div></article>)}
          <h3 className="section-label"><Text>{"Notifications"}</Text></h3>
          {notifications.length === 0 && <p className="empty-state"><Text>{"No new signals. The wasteland is quiet."}</Text></p>}
          {notifications.map((note) => {
            const systemMessage = note.kind === "chat_mention" || note.kind === "chat_reply";
            return <button key={note.id} onClick={() => markRead(note)} className={`notice-card ${note.read_at ? "is-read" : ""}`}><span className="notice-icon">✦</span><span><strong>{systemMessage ? t(note.title) : note.title}</strong><small>{systemMessage ? t(note.body) : note.body}</small></span></button>;
          })}
        </div>
      </section> : selected ? <>
        <section className="conversation-panel">
          <header className="chat-topbar"><div className="channel-title"><span className="channel-mark">#</span><div><h2>{t(selected.name)}</h2><p>{t(selected.topic || "Alliance transmissions and community conversation")}</p></div></div><div className="topbar-tools"><span className="live-pill"><i /> {" "}<Text>{"LIVE"}</Text></span><button className="account-button" onClick={signOut} title={t("Signed in as {accountEmail}. Click to sign out.", { accountEmail: accountEmail })}>{accountEmail || t("Signed in")} {" "}<Text>{"· Sign out"}</Text></button><button className={`icon-button ${utility==="pins"?"is-active":""}`} onClick={()=>setUtility(utility==="pins"?null:"pins")} title={t("Pinned messages")}>◆</button><button className={`icon-button ${utility==="search"?"is-active":""}`} onClick={()=>setUtility(utility==="search"?null:"search")} title={t("Search this channel")}>⌕</button></div></header>
          <MessageList channelId={selected.id} refreshVersion={messageVersion} onReply={(id, label) => setReplyTo({ id, label })} />
          <MessageComposer channelId={selected.id} channelName={selected.name} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={() => { setReplyTo(null); setMessageVersion((value) => value + 1); }} />
        </section>
        {utility?<ChannelUtilityPanel channelId={selected.id} mode={utility} onClose={()=>setUtility(null)} onJump={jumpToMessage}/>:<PresenceList channelId={selected.id} />}
      </> : <p className="empty-state"><Text>{"No channels are available."}</Text></p>}
    </div>
  );
}
