import type { Metadata } from "next";
import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { site } from "@/config/site";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata: Metadata = { title: "Community Chat" };

export default function ChatPage() {
  return (
    <PortalShell>
      <header className="portal-chat-tools"><h1>Alliance frequencies.</h1><Link href="/portal/members">Members &amp; roles</Link><Link href="/academy">Continue academy &rarr;</Link></header>
        <AuthGate featureName="Community chat" redirectPath="/chat">
          <ChatPanel alliance={site.activeAlliance} />
        </AuthGate>
    </PortalShell>
  );
}
