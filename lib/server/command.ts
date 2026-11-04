import { NextResponse } from "next/server";
import { hasOfficerAccess, type OfficerRank, type AllianceRank } from "@/lib/command/access";
import { getSessionUser, type SessionUser } from "./auth";
import { queryOne } from "./db";
import { jsonError } from "./http";

export type { AllianceRank, OfficerRank } from "@/lib/command/access";

export interface AllianceOfficer {
  game_rank: AllianceRank | null;
  in_game_name: string;
  is_site_admin: boolean;
  is_regent: boolean;
}

export async function getAllianceOfficer(userId: string): Promise<AllianceOfficer | null> {
  return queryOne<AllianceOfficer>(
    `select am.game_rank, coalesce(am.is_regent, false) as is_regent, p.in_game_name, is_platform_admin(p.id) as is_site_admin
     from profiles p
     left join alliance_members am on am.user_id = p.id and am.alliance = 'burnfire'
     where p.id = $1 and (
       is_platform_admin(p.id) or
       (am.verified_at is not null and am.game_rank in ('r3', 'r4', 'r5'))
     )`,
    [userId],
  );
}

export async function requireCommandOfficer(minimum: OfficerRank = "r3"): Promise<
  | { user: SessionUser; officer: AllianceOfficer; response?: undefined }
  | { user?: undefined; officer?: undefined; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return { response: jsonError("Sign in to continue.", 401) };
  }

  const officer = await getAllianceOfficer(user.id);
  if (!officer || (!officer.is_site_admin && !hasOfficerAccess(officer.game_rank, minimum, officer.is_regent))) {
    return { response: jsonError("You do not have permission to access this area.", 403) };
  }
  return { user, officer };
}

export function isLeadershipRank(rank: AllianceRank | null): boolean {
  return rank === "r4" || rank === "r5";
}

export function canManageLeadership(officer: AllianceOfficer): boolean {
  return officer.is_site_admin || isLeadershipRank(officer.game_rank);
}

export function trainingScope(officer: AllianceOfficer, userId: string): string | null {
  return !canManageLeadership(officer) ? userId : null;
}

export function canEditTraining(officer: AllianceOfficer): boolean {
  return officer.is_site_admin || hasOfficerAccess(officer.game_rank, "r5", officer.is_regent);
}
