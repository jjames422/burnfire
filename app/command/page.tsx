import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { CommandPanel } from "@/components/command/CommandPanel";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata: Metadata = { title: "Command Center" };

export default function CommandPage() {
  return (
    <PortalShell>
      <AuthGate featureName="Command Center">
        <CommandPanel />
      </AuthGate>
    </PortalShell>
  );
}
