import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { RecruitAcademy } from "@/components/academy/RecruitAcademy";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata: Metadata = { title: "Recruit Academy" };

export default function AcademyPage() {
  return (
    <PortalShell>
      <AuthGate featureName="Recruit Academy">
        <RecruitAcademy />
      </AuthGate>
    </PortalShell>
  );
}
