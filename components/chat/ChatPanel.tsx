"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AllianceInvitationRow, ChannelRow, NotificationRow } from "@/lib/supabase/types";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { PresenceList } from "./PresenceList";

export function ChatPanel({ alliance }: { alliance: string }) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [selected, setSelected] = useState<ChannelRow | null>(null);
  const [workspace, setWorkspace] = useState("community");
  const [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [invitations, setInvitations] = useState<AllianceInvitationRow[]>([]);
  const [showInbox, setShowInbox] = useState(false);
  const [hasAlliance, setHasAlliance] = useState(false);

  async function refreshAccount() {
    if (!supabase) return;
    const [{ data: notes }, { data: invites }, { data: membership }] = await Promise.all([
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("alliance_invitations").select("*").eq("status", "pending"),
      supabase.from("alliance_members").select("alliance").maybeSingle(),
    ]);
    setNotifications(notes ?? []);
    setInvitations(invites ?? []);
    setHasAlliance(Boolean(membership));
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.from("channels").select("*").eq("is_archived", false).order("sort_order")
      .then(({ data }) => setChannels(data ?? []));
    refreshAccount();
  }, []);

  const visible = useMemo(() => channels.filter((channel) =>
    workspace === "community" ? channel.scope === "community" : channel.alliance === workspace,
  ), [channels, workspace]);

  useEffect(() => {
    if (!selected || !visible.some((channel) => channel.id === selected.id)) setSelected(visible[0] ?? null);
  }, [visible, selected]);

  const unread = notifications.filter((note) => !note.read_at).length;

  async function markRead(note: NotificationRow) {
    if (!supabase || note.read_at) return;
    await supabase.rpc("mark_notification_read", { p_notification_id: note.id });
    setNotifications((all) => all.map((item) => item.id === note.id
      ? { ...item, read_at: new Date().toISOString() } : item));
  }

  async function respond(invite: AllianceInvitationRow, accept: boolean) {
    if (!supabase) return;
    await supabase.rpc("respond_to_alliance_invitation", { p_invitation_id: invite.id, p_accept: accept });
    await refreshAccount();
  }

  return (
    <div className="chat-frame">
      <nav className="space-rail" aria-label="Spaces">
        <div className="brand-orb"><img src="/images/burnfire/logo.png" alt="BurnFire" /></div>
        <span className="rail-divider" />
        <button title="Last Asylum Community" onClick={() => { setWorkspace("community"); setShowInbox(false); }} className={`space-button ${workspace === "community" && !showInbox ? "is-active" : ""}`}>LA</button>
        {hasAlliance && <button title="BurnFire Alliance" onClick={() => { setWorkspace(alliance); setShowInbox(false); }} className={`space-button space-button-fire ${workspace === alliance && !showInbox ? "is-active" : ""}`}>BF</button>}
        <button title="Inbox" onClick={() => setShowInbox((value) => !value)} className={`space-button inbox-button ${showInbox ? "is-active" : ""}`}><span aria-hidden="true">✦</span>{unread > 0 && <span className="unread-badge">{unread}</span>}</button>
      </nav>

      <aside className="channel-rail">
        <div className="channel-brand"><span className="eyebrow">Kingdom #324</span><strong>{workspace === "community" ? "Last Asylum" : "BurnFire"}</strong><span>{workspace === "community" ? "Community network" : "Alliance command"}</span></div>
        <div className="channel-heading"><span>Channels</span><span>⌁</span></div>
        <div className="channel-list">{visible.map((channel) => <button key={channel.id} onClick={() => { setSelected(channel); setReplyTo(null); setShowInbox(false); }} className={`channel-button ${selected?.id === channel.id && !showInbox ? "is-active" : ""}`}><span className="hash">#</span><span>{channel.name}</span></button>)}</div>
        <div className="hosted-by"><span className="status-dot" /><span><strong>BurnFire Alliance</strong><small>Unofficial community host</small></span></div>
      </aside>

      {showInbox ? <section className="inbox-panel">
        <header className="chat-topbar"><div><span className="eyebrow">Private to you</span><h2>Signal inbox</h2></div><button onClick={() => setShowInbox(false)} className="ghost-button">Close</button></header>
        <div className="inbox-content">
          {invitations.map((invite) => <article key={invite.id} className="notice-card invite-card"><span className="notice-icon">🔥</span><div><strong>Alliance invitation</strong><p>You were invited with rank {invite.game_rank.toUpperCase()}.</p></div><div className="notice-actions"><button onClick={() => respond(invite, true)} className="ember-button">Accept</button><button onClick={() => respond(invite, false)} className="ghost-button">Decline</button></div></article>)}
          <h3 className="section-label">Notifications</h3>
          {notifications.length === 0 && <p className="empty-state">No new signals. The wasteland is quiet.</p>}
          {notifications.map((note) => <button key={note.id} onClick={() => markRead(note)} className={`notice-card ${note.read_at ? "is-read" : ""}`}><span className="notice-icon">✦</span><span><strong>{note.title}</strong><small>{note.body}</small></span></button>)}
        </div>
      </section> : selected ? <>
        <section className="conversation-panel">
          <header className="chat-topbar"><div className="channel-title"><span className="channel-mark">#</span><div><h2>{selected.name}</h2><p>{selected.topic || "Alliance transmissions and community conversation"}</p></div></div><div className="topbar-tools"><span className="live-pill"><i /> LIVE</span><button className="icon-button" title="Search coming next">⌕</button></div></header>
          <MessageList channelId={selected.id} onReply={(id, label) => setReplyTo({ id, label })} />
          <MessageComposer channelId={selected.id} channelName={selected.name} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={() => setReplyTo(null)} />
        </section>
        <PresenceList alliance={selected.alliance ?? "community"} channelSlug={selected.slug} />
      </> : <p className="empty-state">No channels are available.</p>}
    </div>
  );
}
