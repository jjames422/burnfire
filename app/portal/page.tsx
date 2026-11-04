import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalHome } from "@/components/portal/PortalHome";
import { PortalShell } from "@/components/portal/PortalShell";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Member Portal") }; }

export default async function PortalPage({ searchParams }: PageProps<"/portal">) {
  const signup = (await searchParams).signup === "1";
  return <PortalShell><AuthGate featureName="your BurnFire headquarters" signup={signup}><PortalHome /></AuthGate></PortalShell>;
}
