import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalShell } from "@/components/portal/PortalShell";
import { SignInSettings } from "@/components/portal/SignInSettings";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Sign-in & Security") }; }

export default function SecurityPage() {
  return <PortalShell><AuthGate featureName="account security"><SignInSettings /></AuthGate></PortalShell>;
}
