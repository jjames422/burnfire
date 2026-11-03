import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { AnnouncementFeed } from "@/components/academy/AnnouncementFeed";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata: Metadata = { title: "Alliance Announcements" };

export default function AllianceAnnouncementsPage() {
  return (
    <PortalShell>
      <AuthGate featureName="Alliance announcements">
        <AnnouncementFeed />
      </AuthGate>
    </PortalShell>
  );
}
