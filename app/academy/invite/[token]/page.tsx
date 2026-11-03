import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";
import { InvitationRedeemer } from "@/components/academy/InvitationRedeemer";
import { InvitationTracker } from "@/components/academy/InvitationTracker";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata: Metadata = { title: "Recruit Invitation" };

export default async function RecruitInvitationPage({
  params,
}: PageProps<"/academy/invite/[token]">) {
  const { token } = await params;
  return (
    <PortalShell>
      <InvitationTracker token={token} />
      <AuthGate allowIncompleteProfile featureName="recruit invitation">
        <InvitationRedeemer token={token} />
      </AuthGate>
    </PortalShell>
  );
}
