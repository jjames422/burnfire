import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { requireUser } from "@/lib/server/http";
import type { ChannelRow } from "@/lib/api/types";

/** Channels visible to the signed-in user (community + their alliance). */
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const channels = await query<ChannelRow>(
    `select * from channels c
     where not c.is_archived and (
       (c.scope = 'community' and exists (select 1 from profiles p where p.id = $1))
       or (c.scope = 'alliance' and role_rank(user_role($1, c.alliance)) >= role_rank(c.min_role))
     )
     order by c.scope, c.sort_order`,
    [user.id],
  );
  return NextResponse.json({ channels });
}
