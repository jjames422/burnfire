import { getTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { CommandPanel } from "@/components/command/CommandPanel";
import { PortalShell } from "@/components/portal/PortalShell";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslator(); return { title: t("Command Center") }; }

export default function CommandPage() {
  return (
    <PortalShell>
      <AuthGate featureName="Command Center">
        <CommandPanel />
      </AuthGate>
    </PortalShell>
  );
}
