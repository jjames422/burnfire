"use client";

import { useState } from "react";
import type { ChannelRow } from "@/lib/supabase/types";
import { ChannelSidebar } from "./ChannelSidebar";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { PresenceList } from "./PresenceList";

interface ChatPanelProps {
  alliance: string;
}

/** Composition glue: owns which channel is selected, nothing else. */
export function ChatPanel({ alliance }: ChatPanelProps) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelRow | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-4 sm:flex-row">
      <ChannelSidebar
        alliance={alliance}
        selectedChannelId={selectedChannel?.id ?? null}
        onSelect={setSelectedChannel}
      />
      <div className="flex flex-1 flex-col border border-border bg-surface">
        {selectedChannel ? (
          <>
            <header className="border-b border-border px-4 py-3">
              <h2 className="font-display font-semibold text-text-primary">#{selectedChannel.name}</h2>
              {selectedChannel.topic && (
                <p className="text-xs text-text-secondary">{selectedChannel.topic}</p>
              )}
            </header>
            <MessageList channelId={selectedChannel.id} />
            <MessageComposer channelId={selectedChannel.id} />
          </>
        ) : (
          <p className="p-4 text-text-secondary">No channels available.</p>
        )}
      </div>
      {selectedChannel && <PresenceList alliance={alliance} channelSlug={selectedChannel.slug} />}
    </div>
  );
}
