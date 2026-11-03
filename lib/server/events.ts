/**
 * In-process realtime bus for chat. The site runs as a single `next start`
 * process, so SSE subscribers and the API routes that publish events share
 * this module. Stored on globalThis to survive dev-mode hot reloads.
 */

export type ChatEvent =
  | { type: "message" }
  | { type: "typing"; user_id: string; identity_label: string; typing: boolean }
  | { type: "presence"; users: PresenceEntry[] };

export interface PresenceEntry {
  user_id: string;
  identity_label: string;
}

type Listener = (event: ChatEvent) => void;

class ChatBus {
  private listeners = new Map<string, Set<Listener>>();
  // user may hold several tabs/connections — refcount per user per channel.
  private presence = new Map<string, Map<string, { label: string; count: number }>>();

  subscribe(channelId: string, listener: Listener): () => void {
    let set = this.listeners.get(channelId);
    if (!set) {
      set = new Set();
      this.listeners.set(channelId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(channelId);
    };
  }

  publish(channelId: string, event: ChatEvent): void {
    for (const listener of this.listeners.get(channelId) ?? []) {
      try {
        listener(event);
      } catch {
        // A broken subscriber never blocks the rest.
      }
    }
  }

  presenceSnapshot(channelId: string): PresenceEntry[] {
    const entries = this.presence.get(channelId);
    if (!entries) return [];
    return [...entries.entries()].map(([user_id, { label }]) => ({
      user_id,
      identity_label: label,
    }));
  }

  presenceJoin(channelId: string, userId: string, label: string): void {
    let entries = this.presence.get(channelId);
    if (!entries) {
      entries = new Map();
      this.presence.set(channelId, entries);
    }
    const current = entries.get(userId);
    if (current) {
      current.count += 1;
      current.label = label;
    } else {
      entries.set(userId, { label, count: 1 });
    }
    this.publish(channelId, { type: "presence", users: this.presenceSnapshot(channelId) });
  }

  presenceLeave(channelId: string, userId: string): void {
    const entries = this.presence.get(channelId);
    const current = entries?.get(userId);
    if (!entries || !current) return;
    current.count -= 1;
    if (current.count <= 0) entries.delete(userId);
    if (entries.size === 0) this.presence.delete(channelId);
    this.publish(channelId, { type: "presence", users: this.presenceSnapshot(channelId) });
  }
}

const globalForBus = globalThis as unknown as { burnfireChatBus?: ChatBus };
export const chatBus = globalForBus.burnfireChatBus ?? new ChatBus();
globalForBus.burnfireChatBus = chatBus;
