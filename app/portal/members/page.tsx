import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { MemberManager } from "@/components/portal/MemberManager";
import { PortalShell } from "@/components/portal/PortalShell";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Members & Oversight") }; }

export default function MembersPage() {
  return <PortalShell><AuthGate featureName="member management"><MemberManager /></AuthGate></PortalShell>;
}
