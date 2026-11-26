import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalShell } from "@/components/portal/PortalShell";
import { AllianceIntel } from "@/components/intel/AllianceIntel";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Alliance intelligence") }; }

export default function Page() {
  return <PortalShell><AuthGate featureName="Alliance intelligence"><AllianceIntel /></AuthGate></PortalShell>;
}
