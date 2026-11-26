import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne, withTransaction } from "@/lib/server/db";
import { activeProviderId, audit, homeAlliance, requireIntel, UUID } from "@/lib/server/intel";
import { jsonError } from "@/lib/server/http";

const id = z.string().regex(UUID);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reviewStatus = z.enum(["needs_review", "monitoring", "warned", "excused", "cleared", "confirmed_inactive"]);
const stance = z.enum(["allied", "nap", "neutral", "watch", "rival", "hostile"]);

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open_review"), player_id: id, reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("review_status"), review_id: id, status: reviewStatus, note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("review_note"), review_id: id, body: z.string().trim().min(1).max(1000), warning: z.boolean() }),
  z.object({ action: z.literal("add_absence"), player_id: id, starts_on: date, ends_on: date, reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("cancel_absence"), id }),
  z.object({ action: z.literal("set_relation"), alliance_id: id, stance, summary: z.string().trim().max(500).optional(), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("add_treaty"), alliance_id: id, kind: z.enum(["nap", "alliance", "merger", "ceasefire", "other"]),
    status: z.enum(["proposed", "active", "expired", "ended", "violated", "rejected"]), title: z.string().trim().min(1).max(120),
    terms: z.string().trim().max(2000).optional(), starts_on: date.nullable().optional(), ends_on: date.nullable().optional() }),
  z.object({ action: z.literal("treaty_status"), id, status: z.enum(["proposed", "active", "expired", "ended", "violated", "rejected"]) }),
  z.object({ action: z.literal("add_contact"), alliance_id: id, in_game_name: z.string().trim().min(1).max(60),
    role: z.string().trim().max(60).optional(), notes: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("remove_contact"), id }),
  z.object({ action: z.literal("add_note"), category: z.enum(["diplomacy", "recruitment", "merger", "operations", "event"]),
    title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(4000), alliance_id: id.nullable().optional() }),
  z.object({ action: z.literal("archive_note"), id }),
  z.object({ action: z.literal("link_player"), user_id: id, player_id: id }),
  z.object({ action: z.literal("unlink_player"), user_id: id }),
  z.object({ action: z.literal("set_capacity"), capacity: z.number().int().min(1).max(500).nullable() }),
  z.object({ action: z.literal("set_publication"), kingdom_public: z.boolean() }),
]);

export async function GET() {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const tenant = gate.tenant!;
  const home = await homeAlliance(tenant);
  const [reviews, events, absences, alliances, relations, history, treaties, contacts, notes, links, candidates] = await Promise.all([
    query(`select r.id, r.player_id, p.name, r.status, r.opened_reason, r.evidence, r.opened_at, r.updated_at, r.closed_at,
             (select in_game_name from profiles where id = r.opened_by) as opened_by_name
           from intel_reviews r join intel_players p on p.id = r.player_id
           where r.tenant = $1 and (r.closed_at is null or r.closed_at > now() - interval '60 days')
           order by r.closed_at nulls first, r.opened_at desc limit 100`, [tenant]),
    query(`select e.id, e.review_id, e.kind, e.body, e.from_status, e.to_status, e.created_at,
             (select in_game_name from profiles where id = e.actor) as actor_name
           from intel_review_events e join intel_reviews r on r.id = e.review_id
           where r.tenant = $1 and (r.closed_at is null or r.closed_at > now() - interval '60 days') order by e.created_at`, [tenant]),
    query(`select a.id, a.player_id, p.name, a.starts_on::text, a.ends_on::text, a.reason, a.created_at
           from intel_absences a join intel_players p on p.id = a.player_id
           where a.tenant = $1 and a.cancelled_at is null and a.ends_on >= current_date - 7 order by a.starts_on`, [tenant]),
    query(`select id, tag, name from intel_alliances where kingdom = $1 and provider = $2 and tenant is distinct from $3
           order by tracked desc, tag`, [home?.kingdom ?? gate.access.kingdom ?? 324, activeProviderId(), tenant]),
    query(`select alliance_id, stance, summary, updated_at, (select in_game_name from profiles where id = updated_by) as updated_by_name
           from intel_relations where tenant = $1`, [tenant]),
    query(`select alliance_id, from_stance, to_stance, note, created_at, (select in_game_name from profiles where id = actor) as actor_name
           from intel_relation_history where tenant = $1 order by created_at desc limit 50`, [tenant]),
    query(`select t.id, t.alliance_id, t.kind, t.status, t.title, t.terms, t.starts_on::text, t.ends_on::text, t.updated_at
           from intel_treaties t where t.tenant = $1 order by t.updated_at desc limit 100`, [tenant]),
    query(`select id, alliance_id, in_game_name, role, notes, created_at from intel_contacts
           where tenant = $1 and removed_at is null order by in_game_name`, [tenant]),
    query(`select n.id, n.category, n.title, n.body, n.alliance_id, n.created_at, (select in_game_name from profiles where id = n.created_by) as author
           from intel_leadership_notes n where n.tenant = $1 and n.archived_at is null order by n.created_at desc limit 100`, [tenant]),
    query(`select l.user_id, l.player_id, pr.in_game_name as site_name, p.name as player_name, p.external_uid::text as uid
           from intel_player_links l join intel_players p on p.id = l.player_id left join profiles pr on pr.id = l.user_id
           where l.tenant = $1 order by pr.in_game_name`, [tenant]),
    // Suggested links: a verified member whose submitted game id equals a roster character id, or whose
    // in-game name matches exactly. Leadership confirms every link; nothing is linked automatically.
    home ? query(`select am.user_id, pr.in_game_name as site_name, e.game_identifier, p.id as player_id, p.name as player_name,
             p.external_uid::text as uid, case when e.game_identifier = p.external_uid::text then 'game_id' else 'name' end as matched_by
           from alliance_members am join profiles pr on pr.id = am.user_id
           left join academy_enrollments e on e.user_id = am.user_id
           join intel_memberships m on m.alliance_id = $2 and m.status = 'active'
           join intel_players p on p.id = m.player_id
           where am.alliance = $1 and am.verified_at is not null
             and not exists (select 1 from intel_player_links l where l.user_id = am.user_id or l.player_id = p.id)
             and (trim(e.game_identifier) = p.external_uid::text or lower(pr.in_game_name) = lower(p.name))
           order by pr.in_game_name limit 60`, [tenant, home.id]) : Promise.resolve([]),
  ]);
  const unlinked = await query(
    `select am.user_id, pr.in_game_name as site_name from alliance_members am join profiles pr on pr.id = am.user_id
     where am.alliance = $1 and am.verified_at is not null
       and not exists (select 1 from intel_player_links l where l.user_id = am.user_id) order by pr.in_game_name`, [tenant]);
  const roster = home ? await query(
    `select p.id, p.name, p.external_uid::text as uid from intel_memberships m join intel_players p on p.id = m.player_id
     where m.alliance_id = $1 and m.status = 'active' order by p.name`, [home.id]) : [];
  const settings = await queryOne<{ kingdom_public: boolean; inactivity_days: number }>(
    `select kingdom_public, inactivity_days from intel_settings where tenant = $1`, [tenant]);
  return NextResponse.json({
    capacity: home?.member_capacity ?? null,
    kingdom_public: settings?.kingdom_public ?? false,
    inactivity_days: settings?.inactivity_days ?? 7,
    reviews, review_events: events, absences, alliances, relations, relation_history: history,
    treaties, contacts, notes, links, link_candidates: candidates, unlinked_members: unlinked, roster,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the form and try again.");
  const input = parsed.data;
  const tenant = gate.tenant!;
  const actor = gate.user.id;
  const home = await homeAlliance(tenant);

  const ownPlayer = async (playerId: string) => Boolean(home && await queryOne(
    `select 1 from intel_memberships where player_id = $1 and alliance_id = $2`, [playerId, home.id]));
  const otherAlliance = async (allianceId: string) => Boolean(await queryOne(
    `select 1 from intel_alliances where id = $1 and tenant is distinct from $2`, [allianceId, tenant]));

  switch (input.action) {
    case "open_review": {
      if (!await ownPlayer(input.player_id)) return jsonError("That member is not on your roster.", 404);
      const created = await withTransaction(async (client) => {
        const { rows: [review] } = await client.query<{ id: string }>(
          `insert into intel_reviews (tenant, player_id, opened_reason, opened_by) values ($1, $2, $3, $4)
           on conflict (tenant, player_id) where closed_at is null do nothing returning id`,
          [tenant, input.player_id, input.reason, actor]);
        if (!review) return null;
        await client.query(`insert into intel_review_events (review_id, kind, body, to_status, actor) values ($1, 'opened', $2, 'needs_review', $3)`,
          [review.id, input.reason, actor]);
        return review.id;
      });
      if (!created) return jsonError("This member already has an open review.", 409);
      await audit(tenant, actor, "review.open", `review:${created}`);
      return NextResponse.json({ id: created });
    }
    case "review_status": {
      const closing = ["cleared", "excused", "confirmed_inactive"].includes(input.status);
      const changed = await withTransaction(async (client) => {
        const { rows: [review] } = await client.query<{ status: string }>(
          `select status from intel_reviews where id = $1 and tenant = $2 and closed_at is null for update`, [input.review_id, tenant]);
        if (!review) return false;
        await client.query(
          `update intel_reviews set status = $2, updated_at = now(), closed_at = case when $3 then now() end,
             closed_by = case when $3 then $4::uuid end where id = $1`,
          [input.review_id, input.status, closing, actor]);
        await client.query(
          `insert into intel_review_events (review_id, kind, body, from_status, to_status, actor) values ($1, 'status', $2, $3, $4, $5)`,
          [input.review_id, input.note || null, review.status, input.status, actor]);
        return true;
      });
      if (!changed) return jsonError("That review is closed or was not found.", 404);
      await audit(tenant, actor, "review.status", `review:${input.review_id}`, { status: input.status });
      return NextResponse.json({ ok: true });
    }
    case "review_note": {
      const rows = await query<{ id: string }>(
        `insert into intel_review_events (review_id, kind, body, actor)
         select r.id, $3, $4, $5 from intel_reviews r where r.id = $1 and r.tenant = $2 returning id`,
        [input.review_id, tenant, input.warning ? "warning" : "note", input.body, actor]);
      if (!rows.length) return jsonError("Review was not found.", 404);
      if (input.warning) await query(`update intel_reviews set status = 'warned', updated_at = now() where id = $1 and closed_at is null`, [input.review_id]);
      await audit(tenant, actor, input.warning ? "review.warning" : "review.note", `review:${input.review_id}`);
      return NextResponse.json({ ok: true });
    }
    case "add_absence": {
      if (input.ends_on < input.starts_on) return jsonError("The absence must end on or after its start date.");
      if (!await ownPlayer(input.player_id)) return jsonError("That member is not on your roster.", 404);
      const [row] = await query<{ id: string }>(
        `insert into intel_absences (tenant, player_id, starts_on, ends_on, reason, created_by) values ($1, $2, $3, $4, $5, $6) returning id`,
        [tenant, input.player_id, input.starts_on, input.ends_on, input.reason || null, actor]).catch(() => []);
      if (!row) return jsonError("Absences can last up to 120 days.");
      await audit(tenant, actor, "absence.add", `absence:${row.id}`);
      return NextResponse.json({ id: row.id });
    }
    case "cancel_absence": {
      const rows = await query(`update intel_absences set cancelled_at = now() where id = $1 and tenant = $2 and cancelled_at is null returning id`, [input.id, tenant]);
      if (!rows.length) return jsonError("Absence was not found.", 404);
      await audit(tenant, actor, "absence.cancel", `absence:${input.id}`);
      return NextResponse.json({ ok: true });
    }
    case "set_relation": {
      if (!await otherAlliance(input.alliance_id)) return jsonError("Choose another alliance.", 404);
      await withTransaction(async (client) => {
        const { rows: [previous] } = await client.query<{ stance: string }>(
          `select stance from intel_relations where tenant = $1 and alliance_id = $2 for update`, [tenant, input.alliance_id]);
        await client.query(
          `insert into intel_relations (tenant, alliance_id, stance, summary, updated_by) values ($1, $2, $3, $4, $5)
           on conflict (tenant, alliance_id) do update set stance = $3, summary = $4, updated_by = $5, updated_at = now()`,
          [tenant, input.alliance_id, input.stance, input.summary || null, actor]);
        if (previous?.stance !== input.stance) {
          await client.query(
            `insert into intel_relation_history (tenant, alliance_id, from_stance, to_stance, note, actor) values ($1, $2, $3, $4, $5, $6)`,
            [tenant, input.alliance_id, previous?.stance ?? null, input.stance, input.note || null, actor]);
        }
      });
      await audit(tenant, actor, "diplomacy.stance", `alliance:${input.alliance_id}`, { stance: input.stance });
      return NextResponse.json({ ok: true });
    }
    case "add_treaty": {
      if (!await otherAlliance(input.alliance_id)) return jsonError("Choose another alliance.", 404);
      const [row] = await query<{ id: string }>(
        `insert into intel_treaties (tenant, alliance_id, kind, status, title, terms, starts_on, ends_on, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning id`,
        [tenant, input.alliance_id, input.kind, input.status, input.title, input.terms || null, input.starts_on || null, input.ends_on || null, actor]);
      await audit(tenant, actor, "diplomacy.treaty", `treaty:${row.id}`, { kind: input.kind, status: input.status });
      return NextResponse.json({ id: row.id });
    }
    case "treaty_status": {
      const rows = await query(`update intel_treaties set status = $3, updated_by = $4, updated_at = now() where id = $1 and tenant = $2 returning id`,
        [input.id, tenant, input.status, actor]);
      if (!rows.length) return jsonError("Treaty was not found.", 404);
      await audit(tenant, actor, "diplomacy.treaty.status", `treaty:${input.id}`, { status: input.status });
      return NextResponse.json({ ok: true });
    }
    case "add_contact": {
      if (!await otherAlliance(input.alliance_id)) return jsonError("Choose another alliance.", 404);
      const [row] = await query<{ id: string }>(
        `insert into intel_contacts (tenant, alliance_id, in_game_name, role, notes, created_by) values ($1, $2, $3, $4, $5, $6) returning id`,
        [tenant, input.alliance_id, input.in_game_name, input.role || null, input.notes || null, actor]);
      await audit(tenant, actor, "diplomacy.contact", `contact:${row.id}`);
      return NextResponse.json({ id: row.id });
    }
    case "remove_contact": {
      const rows = await query(`update intel_contacts set removed_at = now() where id = $1 and tenant = $2 and removed_at is null returning id`, [input.id, tenant]);
      if (!rows.length) return jsonError("Contact was not found.", 404);
      await audit(tenant, actor, "diplomacy.contact.remove", `contact:${input.id}`);
      return NextResponse.json({ ok: true });
    }
    case "add_note": {
      if (input.alliance_id && !await otherAlliance(input.alliance_id)) return jsonError("Choose another alliance.", 404);
      const [row] = await query<{ id: string }>(
        `insert into intel_leadership_notes (tenant, alliance_id, category, title, body, created_by) values ($1, $2, $3, $4, $5, $6) returning id`,
        [tenant, input.alliance_id ?? null, input.category, input.title, input.body, actor]);
      await audit(tenant, actor, "note.add", `note:${row.id}`, { category: input.category });
      return NextResponse.json({ id: row.id });
    }
    case "archive_note": {
      const rows = await query(`update intel_leadership_notes set archived_at = now() where id = $1 and tenant = $2 and archived_at is null returning id`, [input.id, tenant]);
      if (!rows.length) return jsonError("Note was not found.", 404);
      await audit(tenant, actor, "note.archive", `note:${input.id}`);
      return NextResponse.json({ ok: true });
    }
    case "link_player": {
      const member = await queryOne(`select 1 from alliance_members where user_id = $1 and alliance = $2 and verified_at is not null`, [input.user_id, tenant]);
      if (!member || !await ownPlayer(input.player_id)) return jsonError("Both the account and the character must belong to your alliance.", 404);
      const rows = await query(
        `insert into intel_player_links (user_id, player_id, tenant, linked_by) values ($1, $2, $3, $4) on conflict do nothing returning user_id`,
        [input.user_id, input.player_id, tenant, actor]);
      if (!rows.length) return jsonError("That account or character is already linked.", 409);
      await audit(tenant, actor, "link.add", `user:${input.user_id}`, { player: input.player_id });
      return NextResponse.json({ ok: true });
    }
    case "unlink_player": {
      const rows = await query(`delete from intel_player_links where user_id = $1 and tenant = $2 returning user_id`, [input.user_id, tenant]);
      if (!rows.length) return jsonError("Link was not found.", 404);
      await audit(tenant, actor, "link.remove", `user:${input.user_id}`);
      return NextResponse.json({ ok: true });
    }
    case "set_capacity": {
      if (!home) return jsonError("Your alliance is not connected to a data provider yet.", 404);
      await query(`update intel_alliances set member_capacity = $2 where id = $1`, [home.id, input.capacity]);
      await audit(tenant, actor, "alliance.capacity", `alliance:${home.id}`, { capacity: input.capacity });
      return NextResponse.json({ ok: true });
    }
    case "set_publication": {
      // Publishes aggregate kingdom standings only; rosters and leadership records stay private.
      await query(`update intel_settings set kingdom_public = $2, updated_by = $3, updated_at = now() where tenant = $1`, [tenant, input.kingdom_public, actor]);
      await audit(tenant, actor, "kingdom.publication", `tenant:${tenant}`, { kingdom_public: input.kingdom_public });
      return NextResponse.json({ ok: true });
    }
  }
}
