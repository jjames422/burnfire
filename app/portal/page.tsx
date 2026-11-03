import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalHome } from "@/components/portal/PortalHome";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata: Metadata = { title: "Member Portal" };

export default function PortalPage() {
  return <PortalShell><AuthGate featureName="your BurnFire headquarters"><PortalHome /></AuthGate></PortalShell>;
}
