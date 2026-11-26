import { DAY, assessActivity, distribution, growthOver, growthPercentile, median, toleranceFor, trackedStandings, type Point } from "@/lib/intel/analytics.ts";
import { activeProviderId, freshness, homeAlliance, type IntelAccess } from "./intel";
import { query, queryOne } from "./db";

const num = (value: string | number | null | undefined) => (value === null || value === undefined ? null : Number(value));
const ms = (value: string | Date | null | undefined) => (value ? new Date(value).getTime() : null);

/** Daily closes beyond the last 48 hours, every point inside them. */
function compactSeries<T extends { t: number }>(rows: T[]): T[] {
  const cutoff = Date.now() - 2 * DAY;
  const daily = new Map<number, T>();
  const recent: T[] = [];
  for (const row of rows) {
    if (row.t >= cutoff) recent.push(row);
    else daily.set(Math.floor(row.t / DAY), row);
  }
  return [...daily.values(), ...recent].sort((a, b) => a.t - b.t);
}

function nearestSql(alias: string, intervalHours: number) {
  const tolerance = Math.round(toleranceFor(intervalHours * 3_600_000) / 60_000);
  return `left join lateral (
      select s.power, s.observed_at from intel_member_snapshots s
      where s.player_id = m.player_id and s.alliance_id = m.alliance_id and s.power is not null
        and s.observed_at between l.observed_at - make_interval(hours => ${intervalHours}) - make_interval(mins => ${tolerance})
                              and l.observed_at - make_interval(hours => ${intervalHours}) + make_interval(mins => ${tolerance})
      order by abs(extract(epoch from s.observed_at - (l.observed_at - make_interval(hours => ${intervalHours}))))
      limit 1) ${alias} on true`;
}

type MemberRow = {
  player_id: string; uid: string; name: string; provider_joined_at: string | null; first_seen_at: string;
  last_online_at: string | null; latest_at: string | null; power: string | null; sanctuary_level: number | null;
  weekly_activity: string | null; p1: string | null; p7: string | null; p30: string | null; t7: string | null;
  pt: string | null; tt: string | null; honor_7d: string | null; tech_7d: string | null; contribution_days: number | null;
  site_rank: string | null; linked_user: string | null; on_absence: boolean; review_status: string | null; review_id: string | null;
  previous_names: string[] | null;
};

export async function loadAllianceDashboard(tenant: string, access: IntelAccess, userId: string) {
  const alliance = await homeAlliance(tenant);
  if (!alliance) return { configured: false as const, freshness: freshness(null) };
  const settings = await queryOne<{ inactivity_days: number }>(`select inactivity_days from intel_settings where tenant = $1`, [tenant]);
  const thresholdDays = settings?.inactivity_days ?? 7;

  const seriesRows = await query<{ observed_at: string; total_power: string | null; member_count: number; average_power: string | null; members_with_power: number; sanctuary_levels: Record<string, number> }>(
    `select observed_at, total_power, member_count, average_power, members_with_power, sanctuary_levels
     from intel_alliance_snapshots where alliance_id = $1 and observed_at > now() - interval '120 days' order by observed_at`,
    [alliance.id],
  );
  const series = compactSeries(seriesRows.map((row) => ({
    t: ms(row.observed_at)!, total: num(row.total_power), members: row.member_count, average: num(row.average_power),
  })));
  const totals: Point[] = series.filter((row) => row.total !== null).map((row) => ({ t: row.t, v: row.total! }));
  const latest = seriesRows[seriesRows.length - 1] ?? null;

  const members = await query<MemberRow>(
    `select m.player_id, p.external_uid::text as uid, p.name, m.provider_joined_at, m.first_seen_at, m.last_online_at,
       l.observed_at as latest_at, l.power, l.sanctuary_level, l.weekly_activity,
       d1.power as p1, d7.power as p7, d30.power as p30, d7.observed_at as t7,
       dt.power as pt, dt.observed_at as tt,
       c.honor as honor_7d, c.tech as tech_7d, c.days as contribution_days,
       coalesce(m.rank_label, am.game_rank::text) as site_rank, link.user_id as linked_user,
       exists (select 1 from intel_absences ab where ab.tenant = $2 and ab.player_id = m.player_id and ab.cancelled_at is null
         and current_date between ab.starts_on and ab.ends_on) as on_absence,
       rv.status as review_status, rv.id as review_id,
       (select array_agg(n.name order by n.last_seen_at desc) from intel_player_names n where n.player_id = p.id and n.name <> p.name) as previous_names
     from intel_memberships m
     join intel_players p on p.id = m.player_id
     left join lateral (select * from intel_member_snapshots s where s.player_id = m.player_id and s.alliance_id = m.alliance_id
       order by s.observed_at desc limit 1) l on true
     ${nearestSql("d1", 24)}
     ${nearestSql("d7", 24 * 7)}
     ${nearestSql("d30", 24 * 30)}
     ${nearestSql("dt", 24 * thresholdDays)}
     left join lateral (
       select sum(h)::bigint as honor, sum(t)::bigint as tech, count(*)::int as days from (
         select max(s.daily_honor) as h, max(s.daily_tech) as t from intel_member_snapshots s
         where s.player_id = m.player_id and s.alliance_id = m.alliance_id
           and s.observed_at >= (date_trunc('day', now() at time zone 'UTC') - interval '6 days') at time zone 'UTC'
           and (s.daily_honor is not null or s.daily_tech is not null)
         group by date_trunc('day', s.observed_at at time zone 'UTC')) d) c on true
     left join intel_player_links link on link.player_id = p.id and link.tenant = $2
     left join alliance_members am on am.user_id = link.user_id and am.alliance = $2 and am.verified_at is not null
     left join intel_reviews rv on rv.tenant = $2 and rv.player_id = p.id and rv.closed_at is null
     where m.alliance_id = $1 and m.status = 'active'
     order by l.power desc nulls last`,
    [alliance.id, tenant],
  );

  const now = Date.now();
  const growth7: number[] = [];
  const roster = members.map((row) => {
    const power = num(row.power);
    const delta = (past: string | null) => (power !== null && past !== null ? power - Number(past) : null);
    const pct = (past: string | null) => (power !== null && past !== null && Number(past) > 0 ? ((power - Number(past)) / Number(past)) * 100 : null);
    const g7 = pct(row.p7);
    if (g7 !== null) growth7.push(g7);
    const self = row.player_id === access.linkedPlayerId;
    const showPrivate = access.leadership || self;
    const assessment = access.leadership ? assessActivity({
      now, thresholdDays, lastObservedAt: ms(row.latest_at), lastOnlineAt: ms(row.last_online_at),
      joinedAt: ms(row.provider_joined_at) ?? ms(row.first_seen_at), onApprovedAbsence: row.on_absence,
      power: [row.pt && row.tt ? { t: ms(row.tt)!, v: Number(row.pt) } : null, power !== null && row.latest_at ? { t: ms(row.latest_at)!, v: power } : null]
        .filter((point): point is Point => point !== null),
      weeklyActivity: num(row.weekly_activity),
    }) : null;
    return {
      player_id: row.player_id,
      uid: row.uid,
      name: row.name,
      previous_names: row.previous_names ?? [],
      site_rank: row.site_rank,
      is_self: self,
      power,
      sanctuary_level: row.sanctuary_level,
      growth_24h: delta(row.p1), growth_24h_pct: pct(row.p1),
      growth_7d: delta(row.p7), growth_7d_pct: g7,
      growth_30d: delta(row.p30), growth_30d_pct: pct(row.p30),
      joined_at: row.provider_joined_at,
      first_seen_at: row.first_seen_at,
      observed_at: row.latest_at,
      honor_7d: showPrivate ? num(row.honor_7d) : null,
      tech_7d: showPrivate ? num(row.tech_7d) : null,
      contribution_days: showPrivate ? row.contribution_days : null,
      weekly_activity: showPrivate ? num(row.weekly_activity) : null,
      last_online_at: access.leadership ? row.last_online_at : null,
      activity: assessment,
      on_absence: access.leadership ? row.on_absence : null,
      review_status: access.leadership ? row.review_status : null,
      review_id: access.leadership ? row.review_id : null,
    };
  });

  const changes = await query<{ player_id: string; name: string; kind: "joined" | "left"; at: string }>(
    `select m.player_id, p.name, 'joined' as kind, m.first_seen_at as at from intel_memberships m join intel_players p on p.id = m.player_id
       where m.alliance_id = $1 and m.first_seen_at > now() - interval '30 days'
         and m.first_seen_at > (select min(first_seen_at) + interval '1 hour' from intel_memberships where alliance_id = $1)
     union all
     select m.player_id, p.name, 'left', m.left_detected_at from intel_memberships m join intel_players p on p.id = m.player_id
       where m.alliance_id = $1 and m.status = 'left' and m.left_detected_at > now() - interval '30 days'
     order by at desc limit 40`,
    [alliance.id],
  );
  const renames = await query<{ player_id: string; name: string; previous: string; at: string }>(
    `select p.id as player_id, p.name, n.name as previous, n.last_seen_at as at
     from intel_player_names n join intel_players p on p.id = n.player_id
     join intel_memberships m on m.player_id = p.id and m.alliance_id = $1 and m.status = 'active'
     where n.name <> p.name and n.last_seen_at > now() - interval '30 days' order by n.last_seen_at desc limit 20`,
    [alliance.id],
  );

  const standings = await kingdomStandings(alliance.kingdom);
  const own = standings.find((row) => row.id === alliance.id);
  const memberCount = latest?.member_count ?? roster.length;
  const powers = roster.map((row) => row.power).filter((value): value is number => value !== null);
  const flags = access.leadership ? roster.reduce<Record<string, number>>((counts, row) => {
    const state = row.activity?.state ?? "unknown";
    counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, {}) : null;

  return {
    configured: true as const,
    freshness: freshness(alliance),
    viewer: { leadership: access.leadership, platform: access.platformAdmin, linked_player_id: access.linkedPlayerId, threshold_days: thresholdDays },
    alliance: { id: alliance.id, tag: alliance.tag, name: alliance.name, level: alliance.level, kingdom: alliance.kingdom, capacity: alliance.member_capacity },
    summary: latest ? {
      total_power: num(latest.total_power),
      members_with_power: latest.members_with_power,
      member_count: memberCount,
      average_power: num(latest.average_power),
      median_power: median(powers),
      capacity: alliance.member_capacity,
      open_slots: alliance.member_capacity ? Math.max(0, alliance.member_capacity - memberCount) : null,
      growth: Object.fromEntries((["24h", "7d", "30d", "90d"] as const).map((key, index) => [key, growthOver(totals, [DAY, 7 * DAY, 30 * DAY, 90 * DAY][index])])),
      tracked_position: own?.position ? { position: own.position, of: standings.filter((row) => row.position !== null).length } : null,
      growing_7d: growth7.filter((value) => value > 0).length,
      measured_7d: growth7.length,
      median_growth_7d_pct: median(growth7),
      honor_7d: members.reduce((sum, row) => sum + (num(row.honor_7d) ?? 0), 0),
      tech_7d: members.reduce((sum, row) => sum + (num(row.tech_7d) ?? 0), 0),
    } : null,
    series,
    sanctuary: distribution(roster.map((row) => row.sanctuary_level)),
    changes,
    renames,
    roster,
    flags,
    self_percentile: (() => {
      const self = roster.find((row) => row.is_self);
      return self?.growth_7d_pct != null ? growthPercentile(self.growth_7d_pct, growth7) : null;
    })(),
    viewer_user: userId,
  };
}

export async function kingdomStandings(kingdom: number) {
  const rows = await query<{
    id: string; tag: string; name: string; tenant: string | null; tracked: boolean; level: number | null;
    last_success_at: string | null; last_observed_at: string | null; consecutive_failures: number; sync_interval_minutes: number;
    total_power: string | null; member_count: number | null; average_power: string | null; members_with_power: number | null;
    p1: string | null; p7: string | null; p30: string | null; m7: number | null;
  }>(
    `select a.id, a.tag, a.name, a.tenant, a.tracked, a.level, a.last_success_at, a.last_observed_at,
       a.consecutive_failures, a.sync_interval_minutes,
       l.total_power, l.member_count, l.average_power, l.members_with_power,
       d1.total_power as p1, d7.total_power as p7, d30.total_power as p30, d7.member_count as m7
     from intel_alliances a
     left join lateral (select * from intel_alliance_snapshots s where s.alliance_id = a.id order by observed_at desc limit 1) l on true
     left join lateral (select total_power from intel_alliance_snapshots s where s.alliance_id = a.id
       and s.observed_at between l.observed_at - interval '27 hours' and l.observed_at - interval '21 hours'
       order by abs(extract(epoch from s.observed_at - (l.observed_at - interval '1 day'))) limit 1) d1 on true
     left join lateral (select total_power, member_count from intel_alliance_snapshots s where s.alliance_id = a.id
       and s.observed_at between l.observed_at - interval '8 days 1 hour' and l.observed_at - interval '5 days 23 hours'
       order by abs(extract(epoch from s.observed_at - (l.observed_at - interval '7 days'))) limit 1) d7 on true
     left join lateral (select total_power from intel_alliance_snapshots s where s.alliance_id = a.id
       and s.observed_at between l.observed_at - interval '34 days 12 hours' and l.observed_at - interval '25 days 12 hours'
       order by abs(extract(epoch from s.observed_at - (l.observed_at - interval '30 days'))) limit 1) d30 on true
     where a.kingdom = $1 and a.provider = $2 and a.tracked`,
    [kingdom, activeProviderId()],
  );
  const standings = trackedStandings(rows.map((row) => ({ id: row.id, totalPower: num(row.total_power), previousTotalPower: num(row.p7) })));
  const position = new Map(standings.map((row) => [row.id, row]));
  return rows.map((row) => {
    const total = num(row.total_power);
    const change = (past: string | null) => (total !== null && past !== null ? total - Number(past) : null);
    const pct = (past: string | null) => (total !== null && past !== null && Number(past) > 0 ? ((total - Number(past)) / Number(past)) * 100 : null);
    return {
      id: row.id, tag: row.tag, name: row.name, is_home: row.tenant !== null, level: row.level,
      total_power: total, member_count: row.member_count, average_power: num(row.average_power),
      members_with_power: row.members_with_power,
      growth_24h: change(row.p1), growth_7d: change(row.p7), growth_30d: change(row.p30),
      growth_24h_pct: pct(row.p1), growth_7d_pct: pct(row.p7), growth_30d_pct: pct(row.p30),
      member_change_7d: row.member_count !== null && row.m7 !== null ? row.member_count - row.m7 : null,
      position: position.get(row.id)?.position ?? null,
      position_change_7d: position.get(row.id)?.change ?? null,
      last_success_at: row.last_success_at, last_observed_at: row.last_observed_at,
      failing: row.consecutive_failures > 0, interval_minutes: row.sync_interval_minutes,
    };
  }).sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
}

export async function loadKingdom(kingdom: number, viewer: { tenant: string | null; leadership: boolean; publicOnly: boolean }, compare: string[], days: number) {
  const meta = await queryOne<{ number: number; name: string | null; opened_on: string | null; season: string | null; notes: string | null; updated_at: string; king_name: string | null; ruling_alliance: string | null }>(
    `select number, name, opened_on::text, season, notes, updated_at, king_name, ruling_alliance from intel_kingdoms where number = $1`, [kingdom]);
  const milestones = await query<{ id: string; start_day: number; end_day: number | null; title: string; kind: string; certainty: string; notes: string | null }>(
    `select id, start_day, end_day, title, kind, certainty, notes from intel_kingdom_milestones where kingdom = $1 order by start_day`, [kingdom]);
  const standings = await kingdomStandings(kingdom);
  const ids = compare.filter((id) => standings.some((row) => row.id === id)).slice(0, 6);
  const comparison = ids.length ? await query<{ alliance_id: string; observed_at: string; total_power: string | null; member_count: number; average_power: string | null }>(
    `select alliance_id, observed_at, total_power, member_count, average_power from intel_alliance_snapshots
     where alliance_id = any($1::uuid[]) and observed_at > now() - make_interval(days => $2) order by observed_at`,
    [ids, days],
  ) : [];
  const series = ids.map((id) => {
    const points = comparison.filter((row) => row.alliance_id === id).map((row) => ({
      t: ms(row.observed_at)!, total: num(row.total_power), members: row.member_count, average: num(row.average_power),
    }));
    const compact = compactSeries(points);
    const first = compact[0]?.t ?? null;
    return {
      id, points: compact,
      coverage_start: first,
      gap_days: first === null ? days : Math.max(0, Math.floor((first - (Date.now() - days * DAY)) / DAY)),
    };
  });
  const visibility = viewer.publicOnly ? ["public"] : viewer.leadership ? ["public", "members", "leadership"] : ["public", "members"];
  const events = await query<{ id: string; occurred_at: string; kind: string; title: string; body: string | null; source: string; verification: string; visibility: string; alliance_tag: string | null }>(
    `select e.id, e.occurred_at, e.kind, e.title, e.body, e.source, e.verification, e.visibility, a.tag as alliance_tag
     from intel_kingdom_events e left join intel_alliances a on a.id = e.alliance_id
     where e.kingdom = $1 and e.visibility = any($2::text[])
       and (e.visibility = 'public' or e.tenant is null or e.tenant = $3)
     order by e.occurred_at desc limit 60`,
    [kingdom, visibility, viewer.tenant],
  );
  const relations = viewer.leadership && viewer.tenant ? await query<{ alliance_id: string; stance: string }>(
    `select alliance_id, stance from intel_relations where tenant = $1`, [viewer.tenant]) : [];
  const latestSync = standings.reduce<string | null>((max, row) => (row.last_success_at && (!max || row.last_success_at > max) ? row.last_success_at : max), null);
  return {
    kingdom: meta ?? { number: kingdom, name: null, opened_on: null, season: null, notes: null, updated_at: null, king_name: null, ruling_alliance: null },
    milestones,
    synthetic: activeProviderId() === "fixture",
    last_success_at: latestSync,
    standings,
    comparison: series,
    events,
    relations: Object.fromEntries(relations.map((row) => [row.alliance_id, row.stance])),
  };
}

export async function loadPlayer(tenant: string, playerId: string, access: IntelAccess) {
  const alliance = await homeAlliance(tenant);
  if (!alliance) return null;
  const player = await queryOne<{ id: string; uid: string; name: string; first_seen_at: string }>(
    `select p.id, p.external_uid::text as uid, p.name, p.first_seen_at from intel_players p
     where p.id = $1 and exists (select 1 from intel_memberships m where m.player_id = p.id and m.alliance_id = $2)`,
    [playerId, alliance.id],
  );
  if (!player) return null;
  const leadership = access.leadership;
  const snapshots = await query<{ observed_at: string; power: string | null; sanctuary_level: number | null; daily_honor: string | null; daily_tech: string | null; weekly_activity: string | null }>(
    `select observed_at, power, sanctuary_level, daily_honor, daily_tech, weekly_activity from intel_member_snapshots
     where player_id = $1 and alliance_id = $2 order by observed_at`,
    [player.id, alliance.id],
  );
  const power: Point[] = snapshots.filter((row) => row.power !== null).map((row) => ({ t: ms(row.observed_at)!, v: Number(row.power) }));
  const contributions = await query<{ day: string; honor: string | null; tech: string | null }>(
    `select to_char(date_trunc('day', observed_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
       max(daily_honor) as honor, max(daily_tech) as tech
     from intel_member_snapshots where player_id = $1 and alliance_id = $2 and observed_at > now() - interval '30 days'
     group by 1 order by 1`,
    [player.id, alliance.id],
  );
  const names = await query<{ name: string; first_seen_at: string; last_seen_at: string }>(
    `select name, first_seen_at, last_seen_at from intel_player_names where player_id = $1 order by first_seen_at`, [player.id]);
  const memberships = await query<{ status: string; first_seen_at: string; last_seen_at: string; left_detected_at: string | null; provider_joined_at: string | null }>(
    `select status, first_seen_at, last_seen_at, left_detected_at, provider_joined_at from intel_memberships
     where player_id = $1 and alliance_id = $2 order by first_seen_at`, [player.id, alliance.id]);
  const peers = await query<{ pct7: string | null; pct30: string | null }>(
    `select
       (l.power - d7.power)::numeric / nullif(d7.power, 0) * 100 as pct7,
       (l.power - d30.power)::numeric / nullif(d30.power, 0) * 100 as pct30
     from intel_memberships m
     left join lateral (select * from intel_member_snapshots s where s.player_id = m.player_id and s.alliance_id = m.alliance_id
       order by s.observed_at desc limit 1) l on true
     ${nearestSql("d7", 24 * 7)}
     ${nearestSql("d30", 24 * 30)}
     where m.alliance_id = $1 and m.status = 'active'`,
    [alliance.id],
  );
  const g7 = growthOver(power, 7 * DAY);
  const g30 = growthOver(power, 30 * DAY);
  const peer7 = peers.map((row) => num(row.pct7)).filter((value): value is number => value !== null);
  const peer30 = peers.map((row) => num(row.pct30)).filter((value): value is number => value !== null);
  const review = leadership ? await query<{ id: string; status: string; opened_reason: string; opened_at: string; closed_at: string | null }>(
    `select id, status, opened_reason, opened_at, closed_at from intel_reviews where tenant = $1 and player_id = $2 order by opened_at desc limit 10`,
    [tenant, player.id]) : [];
  return {
    synthetic: activeProviderId() === "fixture",
    player: { ...player, is_self: player.id === access.linkedPlayerId },
    alliance: { tag: alliance.tag, name: alliance.name },
    freshness: freshness(alliance),
    power: compactSeries(power),
    sanctuary: compactSeries(snapshots.filter((row) => row.sanctuary_level !== null).map((row) => ({ t: ms(row.observed_at)!, v: row.sanctuary_level! }))),
    growth: {
      "24h": growthOver(power, DAY), "7d": g7, "30d": g30, "90d": growthOver(power, 90 * DAY),
    },
    relative: {
      percentile_7d: g7.available && g7.percent !== null ? growthPercentile(g7.percent, peer7) : null,
      percentile_30d: g30.available && g30.percent !== null ? growthPercentile(g30.percent, peer30) : null,
      alliance_median_7d_pct: median(peer7),
      alliance_median_30d_pct: median(peer30),
      peers_7d: peer7.length,
    },
    contributions: contributions.map((row) => ({ day: row.day, honor: num(row.honor), tech: num(row.tech) })),
    names,
    memberships,
    reviews: review,
  };
}
