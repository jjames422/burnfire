import { NextResponse, type NextRequest } from "next/server";
import { syncDeps } from "@/lib/server/intel";
import { runDueSyncs } from "@/lib/intel/sync.ts";
import { secretMatches } from "@/lib/intel/secret.ts";
import { jsonError } from "@/lib/server/http";

export const maxDuration = 60;


/**
 * Scheduler entry point (called every 10 minutes by the host timer). Each
 * call handles at most eight due alliances so it finishes well inside the
 * function time limit; the rest wait for the next call.
 */
export async function POST(request: NextRequest) {
  if (!process.env.INTEL_CRON_SECRET) return jsonError("Scheduler secret is not configured.", 503);
  if (!secretMatches(request.headers.get("authorization"), process.env.INTEL_CRON_SECRET)) return jsonError("Unauthorized.", 401);
  const result = await runDueSyncs(syncDeps(), { limit: 8 });
  return NextResponse.json({
    recovered: result.recovered,
    stopped_for: result.stoppedFor,
    outcomes: result.outcomes.map((outcome) => ({ status: outcome.status, alliance_id: outcome.allianceId,
      ...("code" in outcome ? { code: outcome.code } : {}), ...("reason" in outcome ? { reason: outcome.reason } : {}) })),
    retention: result.retention,
  });
}
