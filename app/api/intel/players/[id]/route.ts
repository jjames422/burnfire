import { NextResponse, type NextRequest } from "next/server";
import { requireIntel, UUID } from "@/lib/server/intel";
import { loadPlayer } from "@/lib/server/intel-queries";
import { jsonError } from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

/** Members may open their own linked character; leadership may open any member of their alliance. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const gate = await requireIntel("member");
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return jsonError("Member was not found.", 404);
  if (!gate.access.leadership && gate.access.linkedPlayerId !== id) {
    return jsonError("You can open your own progression. Leadership can open every member's.", 403);
  }
  const data = await loadPlayer(gate.tenant!, id, gate.access);
  if (!data) return jsonError("Member was not found.", 404);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
