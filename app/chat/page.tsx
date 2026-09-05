import type { Metadata } from "next";
import { site } from "@/config/site";
import { AuthGate } from "@/components/auth/AuthGate";
import { ChatPanel } from "@/components/chat/ChatPanel";

export const metadata: Metadata = {
  title: "Chat",
};

export default function ChatPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12">
      <h1 className="mb-8 font-display text-3xl font-bold text-text-primary">
        {site.alliance.name} Chat
      </h1>
      <AuthGate alliance={site.activeAlliance}>
        <ChatPanel alliance={site.activeAlliance} />
      </AuthGate>
    </main>
  );
}
