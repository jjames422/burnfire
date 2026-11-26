import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalShell } from "@/components/portal/PortalShell";
import { MemberDevelopment } from "@/components/intel/MemberDevelopment";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Member progression") }; }

export default async function Page({ params }: PageProps<"/intel/members/[id]">) {
  const { id } = await params;
  return <PortalShell><AuthGate featureName="Member progression"><MemberDevelopment playerId={id} /></AuthGate></PortalShell>;
}
