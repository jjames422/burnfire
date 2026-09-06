import type { Metadata } from "next";
import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Community Chat" };

export default function ChatPage() {
  return (
    <main className="chat-page">
      <div className="ember-glow ember-glow-one" />
      <div className="ember-glow ember-glow-two" />
      <div className="ember-field" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => <i key={index} />)}
      </div>
      <header className="site-strip">
        <Link href="/" className="wordmark"><span>LAST ASYLUM</span><strong>PLAGUE</strong></Link>
        <nav><Link href="/guides">Guides</Link><Link href="/chat" className="active">Community</Link></nav>
        <span className="host-mark">Brought to you by <strong>BurnFire Alliance</strong> · Kingdom #324</span>
      </header>
      <section className="chat-stage">
        <AuthGate featureName="Community chat" redirectPath="/chat">
          <ChatPanel alliance={site.activeAlliance} />
        </AuthGate>
      </section>
    </main>
  );
}
