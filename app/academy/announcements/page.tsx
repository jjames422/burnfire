import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { AnnouncementFeed } from "@/components/academy/AnnouncementFeed";
import { PortalShell } from "@/components/portal/PortalShell";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Alliance Announcements") }; }

export default function AllianceAnnouncementsPage() {
  return (
    <PortalShell>
      <AuthGate featureName="Alliance announcements">
        <AnnouncementFeed />
      </AuthGate>
    </PortalShell>
  );
}
