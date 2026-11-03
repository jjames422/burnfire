import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { PortalShell } from "@/components/portal/PortalShell";
import { SignInSettings } from "@/components/portal/SignInSettings";

export const metadata: Metadata = { title: "Sign-in & Security" };

export default function SecurityPage() {
  return <PortalShell><AuthGate featureName="account security"><SignInSettings /></AuthGate></PortalShell>;
}
