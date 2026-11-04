import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { RecruitAcademy } from "@/components/academy/RecruitAcademy";
import { PortalShell } from "@/components/portal/PortalShell";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Recruit Academy") }; }

export default function AcademyPage() {
  return (
    <PortalShell>
      <AuthGate featureName="Recruit Academy">
        <RecruitAcademy />
      </AuthGate>
    </PortalShell>
  );
}
