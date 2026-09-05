import type { Metadata } from "next";
import { site } from "@/config/site";
import { AuthGate } from "@/components/auth/AuthGate";

export const metadata: Metadata = {
  title: "Chat",
};

export default function ChatPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="mb-8 font-display text-3xl font-bold text-text-primary">
        {site.alliance.name} Chat
      </h1>
      <AuthGate alliance={site.activeAlliance}>
        <p className="border border-border bg-surface p-4 text-text-secondary">
          You&apos;re signed in and your profile is set up. Channels and messaging land in M6.
        </p>
      </AuthGate>
    </main>
  );
}
