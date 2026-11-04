import { getTranslator } from "@/lib/i18n/server";

import { Text } from "@/components/i18n/LanguageProvider";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { site } from "@/config/site";
import { PortalShell } from "@/components/portal/PortalShell";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Community Chat") }; }

export default function ChatPage() {
  return (
    <PortalShell>
      <header className="portal-chat-tools"><h1><Text>{"Alliance frequencies."}</Text></h1><Link href="/portal/members"><Text>{"Members & roles"}</Text></Link><Link href="/academy"><Text>{"Continue academy →"}</Text></Link></header>
        <AuthGate featureName="Community chat" redirectPath="/chat">
          <ChatPanel alliance={site.activeAlliance} />
        </AuthGate>
    </PortalShell>
  );
}
