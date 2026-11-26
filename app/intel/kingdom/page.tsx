import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalShell } from "@/components/portal/PortalShell";
import { KingdomIntel } from "@/components/intel/KingdomIntel";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Kingdom intelligence") }; }

export default function Page() {
  return <PortalShell><AuthGate featureName="Kingdom intelligence"><KingdomIntel /></AuthGate></PortalShell>;
}
