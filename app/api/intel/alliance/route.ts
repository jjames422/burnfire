import { NextResponse } from "next/server";
import { requireIntel } from "@/lib/server/intel";
import { loadAllianceDashboard } from "@/lib/server/intel-queries";

export async function GET() {
  const gate = await requireIntel("member");
  if (gate.response) return gate.response;
  const data = await loadAllianceDashboard(gate.tenant!, gate.access, gate.user.id);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
