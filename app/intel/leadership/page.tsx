import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalShell } from "@/components/portal/PortalShell";
import { LeadershipDesk } from "@/components/intel/LeadershipDesk";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Leadership command") }; }

export default function Page() {
  return <PortalShell><AuthGate featureName="Leadership command"><LeadershipDesk /></AuthGate></PortalShell>;
}
