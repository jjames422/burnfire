"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  AllianceInvitationRow,
  ChannelRow,
  NotificationRow,
} from "@/lib/supabase/types";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { PresenceList } from "./PresenceList";

export function ChatPanel({ alliance }: { alliance: string }) {
  const [channels, setChannels] = useState<ChannelRow[]>([]),
    [selected, setSelected] = useState<ChannelRow | null>(null);
  const [workspace, setWorkspace] = useState("community"),
    [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(
      null,
    );
  const [notifications, setNotifications] = useState<NotificationRow[]>([]),
    [invitations, setInvitations] = useState<AllianceInvitationRow[]>([]);
  const [showInbox, setShowInbox] = useState(false),
    [hasAlliance, setHasAlliance] = useState(false);
  async function refreshAccount() {
    if (!supabase) return;
    const [{ data: n }, { data: i }, { data: m }] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("alliance_invitations").select("*").eq("status", "pending"),
      supabase.from("alliance_members").select("alliance").maybeSingle(),
    ]);
    setNotifications(n ?? []);
    setInvitations(i ?? []);
    setHasAlliance(Boolean(m));
  }
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("channels")
      .select("*")
      .eq("is_archived", false)
      .order("sort_order")
      .then(({ data }) => setChannels(data ?? []));
    refreshAccount();
  }, []);
  const visible = useMemo(
    () =>
      channels.filter((c) =>
        workspace === "community"
          ? c.scope === "community"
          : c.alliance === workspace,
      ),
    [channels, workspace],
  );
  useEffect(() => {
    if (!selected || !visible.some((c) => c.id === selected.id))
      setSelected(visible[0] ?? null);
  }, [visible, selected]);
  const unread = notifications.filter((n) => !n.read_at).length;
  async function markRead(note: NotificationRow) {
    if (!supabase || note.read_at) return;
    await supabase.rpc("mark_notification_read", {
      p_notification_id: note.id,
    });
    setNotifications((all) =>
      all.map((n) =>
        n.id === note.id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
  }
  async function respond(invite: AllianceInvitationRow, accept: boolean) {
    if (!supabase) return;
    await supabase.rpc("respond_to_alliance_invitation", {
      p_invitation_id: invite.id,
      p_accept: accept,
    });
    await refreshAccount();
  }
  return (
    <div className="flex min-h-[68vh] overflow-hidden border border-border bg-surface">
      <nav
        className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-border bg-bg py-3"
        aria-label="Spaces"
      >
        <button
          title="Community"
          onClick={() => setWorkspace("community")}
          className={`h-10 w-10 border text-sm font-bold ${workspace === "community" ? "border-accent bg-accent" : "border-border"}`}
        >
          LA
        </button>
        {hasAlliance && (
          <button
            title="BurnFire Alliance"
            onClick={() => setWorkspace(alliance)}
            className={`h-10 w-10 border text-sm font-bold ${workspace === alliance ? "border-accent bg-accent" : "border-border"}`}
          >
            BF
          </button>
        )}
        <button
          title="Inbox"
          onClick={() => setShowInbox((v) => !v)}
          className="relative mt-auto h-10 w-10 border border-border"
        >
          ✉
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 bg-warning px-1 text-[10px] text-bg">
              {unread}
            </span>
          )}
        </button>
      </nav>
      <aside className="w-52 shrink-0 border-r border-border p-3">
        <p className="mb-3 font-display text-sm font-bold">
          {workspace === "community"
            ? "Last Asylum Community"
            : "BurnFire Alliance"}
        </p>
        <div className="space-y-1">
          {visible.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelected(c);
                setReplyTo(null);
                setShowInbox(false);
              }}
              className={`block w-full px-2 py-1.5 text-left text-sm ${selected?.id === c.id ? "bg-accent/20 text-text-primary" : "text-text-secondary hover:bg-bg"}`}
            >
              # {c.name}
            </button>
          ))}
        </div>
      </aside>
      {showInbox ? (
        <section className="flex-1 overflow-y-auto p-5">
          <div className="mb-6 flex justify-between">
            <h2 className="font-display text-xl font-bold">Inbox</h2>
            <button onClick={() => setShowInbox(false)}>Close</button>
          </div>
          {invitations.map((i) => (
            <div key={i.id} className="mb-3 border border-border p-4">
              <p>Alliance invitation · {i.game_rank.toUpperCase()}</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => respond(i, true)}
                  className="bg-accent px-3 py-1"
                >
                  Accept
                </button>
                <button
                  onClick={() => respond(i, false)}
                  className="border border-border px-3 py-1"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
          <h3 className="mb-2 mt-6 font-semibold">Notifications</h3>
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead(n)}
              className={`mb-2 block w-full border p-3 text-left ${n.read_at ? "border-border opacity-60" : "border-accent"}`}
            >
              <strong>{n.title}</strong>
              <span className="block text-sm text-text-secondary">
                {n.body}
              </span>
            </button>
          ))}
        </section>
      ) : selected ? (
        <>
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="border-b border-border px-4 py-3">
              <h2 className="font-display font-semibold"># {selected.name}</h2>
              <p className="text-xs text-text-secondary">{selected.topic}</p>
            </header>
            <MessageList
              channelId={selected.id}
              onReply={(id, label) => setReplyTo({ id, label })}
            />
            <MessageComposer
              channelId={selected.id}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onSent={() => setReplyTo(null)}
            />
          </section>
          <PresenceList
            alliance={selected.alliance ?? "community"}
            channelSlug={selected.slug}
          />
        </>
      ) : (
        <p className="p-5 text-text-secondary">No channels are available.</p>
      )}
    </div>
  );
}
