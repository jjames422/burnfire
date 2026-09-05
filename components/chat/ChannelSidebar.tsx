"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase/client";
import type { ChannelRow } from "@/lib/supabase/types";

interface ChannelSidebarProps {
  alliance: string;
  selectedChannelId: string | null;
  onSelect: (channel: ChannelRow) => void;
}

/**
 * Lists only the channels RLS actually lets this user see — an Officer
 * channel is simply absent from the result set for a 'member' role, not
 * hidden client-side, so there's nothing to bypass by inspecting the page.
 */
export function ChannelSidebar({ alliance, selectedChannelId, onSelect }: ChannelSidebarProps) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data } = await supabase!
        .from("channels")
        .select("*")
        .eq("alliance", alliance)
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (data) {
        setChannels(data);
        if (!selectedChannelId && data.length > 0) onSelect(data[0]);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // Only re-run when the alliance changes — selectedChannelId/onSelect
    // deliberately excluded, this effect just does the initial channel load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alliance]);

  if (loading) return <p className="text-text-secondary">Loading channels…</p>;

  return (
    <nav className="w-full shrink-0 border border-border bg-surface sm:w-52">
      <ul>
        {channels.map((channel) => (
          <li key={channel.id}>
            <button
              type="button"
              onClick={() => onSelect(channel)}
              className={clsx(
                "w-full border-b border-border px-4 py-3 text-left",
                channel.id === selectedChannelId
                  ? "bg-accent/15 text-accent-bright"
                  : "text-text-secondary hover:bg-surface-raised hover:text-text-primary",
              )}
            >
              <span className="font-display text-sm font-semibold">#{channel.name}</span>
              {channel.topic && <span className="mt-0.5 block text-xs opacity-70">{channel.topic}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
