"use client";
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text } from "@/components/i18n/LanguageProvider";


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
      <h3><Text>{"Online"}</Text>{" "}<span>{<LocalizedNumber value={users.length} />}</span></h3>
      <ul>
        {users.map((entry) => (
          <li key={entry.user_id}>
            <span className="presence-avatar">{entry.identity_label.slice(0, 1).toUpperCase()}<i /></span>
            <span>{entry.identity_label}<small><Text>{"Online"}</Text></small></span>
          </li>
        ))}
      </ul>
      {users.length === 0 && <p><Text>{"The fire is quiet."}</Text><br /><Text>{"Others will appear here."}</Text></p>}
    </aside>
  );
}
