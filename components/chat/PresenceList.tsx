"use client";

import { useCallback, useState } from "react";
import { useChannelStream } from "@/lib/api/stream";

interface PresenceEntry {
  user_id: string;
  identity_label: string;
}

/**
 * Live member list for the selected channel. Presence is tracked by the
 * channel's SSE stream itself — holding the stream open marks you online,
 * and the server pushes a fresh roster whenever someone joins or leaves.
 */
export function PresenceList({ channelId }: { channelId: string }) {
  const [users, setUsers] = useState<PresenceEntry[]>([]);

  useChannelStream(channelId, useCallback((event) => {
    if (event.type === "presence") setUsers(event.users);
  }, []));

  return (
    <aside className="presence-rail">
      <h3>Online <span>{users.length}</span></h3>
      <ul>
        {users.map((entry) => (
          <li key={entry.user_id}>
            <span className="presence-avatar">{entry.identity_label.slice(0, 1).toUpperCase()}<i /></span>
            <span>{entry.identity_label}<small>Online</small></span>
          </li>
        ))}
      </ul>
      {users.length === 0 && <p>The fire is quiet.<br />Others will appear here.</p>}
    </aside>
  );
}
