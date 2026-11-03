import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { MemberManager } from "@/components/portal/MemberManager";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata: Metadata = { title: "Members & Oversight" };

export default function MembersPage() {
  return <PortalShell><AuthGate featureName="member management"><MemberManager /></AuthGate></PortalShell>;
}
