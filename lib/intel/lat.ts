// Last Asylum Tracker client (https://api.lastasylumtracker.com/docs).
// Uses only the documented /v1 alliance endpoints. The tracker website's own
// /api/ routes are undocumented and disallowed by its robots.txt, so they are
// never called. The key is read on the server and is never logged or stored.
//
// The public docs list field names but publish no response schema, so the
// parser accepts the documented names plus close variants, rejects answers
// without a usable identity, and reports every field name it saw so an
// administrator can review the live shape (values are never recorded).

import { z } from "zod";
import {
  ProviderError,
  type IntelProvider,
  type NormalizedAlliance,
  type NormalizedMember,
  type ProviderQuota,
  type ProviderResult,
} from "./types.ts";

export const LAT_BASE_URL = "https://api.lastasylumtracker.com";
const USER_AGENT = "BurnFireIntel/1.0 (+https://www.burnfire2.com)";
const MAX_POWER = 1e13;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface LatOptions {
  apiKey: string | undefined;
  baseUrl?: string;
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
  now?: () => Date;
}

const record = z.record(z.string(), z.unknown());
const envelope = z.looseObject({
  ok: z.boolean().optional(),
  cached: z.boolean().optional(),
  age_seconds: z.number().nonnegative().optional(),
  refreshing: z.boolean().optional(),
  quota: z.looseObject({
    limit: z.number().optional(),
    remaining: z.number().optional(),
    resets: z.string().optional(),
  }).optional(),
});

function pick(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function idString(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d{0,18}$/.test(value.trim())) return value.trim();
  return null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.length >= 1 && cleaned.length <= max ? cleaned : null;
}

/** Unix seconds, unix milliseconds, or ISO-8601 to ISO-8601; otherwise null. */
export function timestamp(value: unknown): string | null {
  const numeric = finiteNumber(value);
  let date: Date | null = null;
  if (numeric !== null && numeric > 0) date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) date = new Date(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  return year >= 2020 && year <= 2100 ? date.toISOString() : null;
}

function activity(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function sanctuary(value: unknown): number | null {
  if (value && typeof value === "object") return boundedInteger(pick(value as Record<string, unknown>, ["lv", "level"]), 1, 200);
  return boundedInteger(value, 1, 200);
}

export function normalizeMember(raw: unknown, warnings: string[]): NormalizedMember | null {
  const parsed = record.safeParse(raw);
  if (!parsed.success) { warnings.push("member_not_object"); return null; }
  const source = parsed.data;
  const uid = idString(pick(source, ["uid", "id", "player_id"]));
  const name = text(pick(source, ["nick_name", "name", "nick", "nickname"]), 80);
  if (!uid || !name) { warnings.push("member_without_identity"); return null; }
  const rawPower = finiteNumber(pick(source, ["power", "might"]));
  const power = rawPower !== null && rawPower >= 0 && rawPower <= MAX_POWER ? Math.round(rawPower) : null;
  if (rawPower !== null && power === null) warnings.push("member_power_out_of_range");
  return {
    uid,
    name,
    power,
    sanctuaryLevel: sanctuary(pick(source, ["sanctuary_lv", "sanctuary_level", "sanctuary", "lv"])),
    dailyHonor: boundedInteger(pick(source, ["daily_honor"]), 0, 1e12),
    dailyTech: boundedInteger(pick(source, ["daily_tech"]), 0, 1e12),
    weeklyActivity: activity(pick(source, ["active", "weekly_active", "activity"])),
    joinedAt: timestamp(pick(source, ["joined_at", "join_time"])),
    lastOnlineAt: timestamp(pick(source, ["last_online_at", "last_online"])),
    rank: text(pick(source, ["rank_label", "rank_code", "rank"]), 20),
  };
}

export function normalizeAlliance(raw: unknown, warnings: string[] = []): NormalizedAlliance {
  const outer = record.safeParse(raw);
  if (!outer.success) throw new ProviderError("invalid_response", "Provider answer was not a JSON object.");
  const nested = record.safeParse(outer.data.alliance);
  const source = nested.success ? nested.data : outer.data;
  // Live answers (verified 2026-11-26) use union_id and sid; the rest are documented aliases.
  const externalId = idString(pick(source, ["union_id", "aid", "alliance_id", "id"]));
  const tag = text(pick(source, ["abbr", "abbreviation", "tag", "short_name"]), 16);
  const name = text(pick(source, ["name", "alliance_name"]), 80);
  if (!externalId || !tag || !name) {
    throw new ProviderError("invalid_response", "Provider alliance answer lacked an id, tag, or name.");
  }
  const rosterSource = pick(source, ["members", "roster"]) ?? outer.data.members;
  const rosterIncluded = Array.isArray(rosterSource);
  const seen = new Set<string>();
  const members: NormalizedMember[] = [];
  for (const row of rosterIncluded ? (rosterSource as unknown[]) : []) {
    const member = normalizeMember(row, warnings);
    if (!member) continue;
    if (seen.has(member.uid)) { warnings.push("duplicate_member_uid"); continue; }
    seen.add(member.uid);
    members.push(member);
  }
  const declared = boundedInteger(pick(source, ["member_count", "members_count", "member_num", "count"]), 0, 500);
  return {
    externalId,
    kingdom: boundedInteger(pick(source, ["sid", "kid", "server", "kingdom", "server_id"]), 1, 100000),
    tag,
    name,
    level: boundedInteger(pick(source, ["level", "lv"]), 1, 100),
    memberCount: declared ?? members.length,
    capacity: boundedInteger(pick(source, ["capacity", "max_members"]), 1, 500),
    reportedPower: (() => {
      const power = finiteNumber(pick(source, ["power"]));
      return power !== null && power >= 0 && power <= MAX_POWER * 100 ? Math.round(power) : null;
    })(),
    rosterIncluded,
    members,
  };
}

/**
 * Field names only, up to three levels deep (arrays sampled as "[]").
 * Values never leave this function.
 */
export function responseShape(raw: unknown): string[] {
  const keys = new Set<string>();
  const walk = (value: unknown, prefix: string, depth: number) => {
    if (depth > 3 || keys.size > 200) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) walk(item, `${prefix}[]`, depth);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value as object).slice(0, 80)) {
      const path = prefix ? `${prefix}.${key}` : key;
      keys.add(path);
      walk((value as Record<string, unknown>)[key], path, depth + 1);
    }
  };
  walk(raw, "", 0);
  return [...keys].sort();
}

export function parseQuota(headers: Headers, body: unknown): ProviderQuota {
  const fromBody = envelope.safeParse(body);
  const quota = fromBody.success ? fromBody.data.quota : undefined;
  const header = (name: string) => finiteNumber(headers.get(name));
  return {
    limit: quota?.limit ?? header("x-ratelimit-limit"),
    remaining: quota?.remaining ?? header("x-ratelimit-remaining"),
    resets: quota?.resets ?? headers.get("x-ratelimit-reset"),
  };
}

function errorFor(status: number, body: unknown, quota: ProviderQuota, attempts: number): ProviderError {
  const options = { status, quota, attempts };
  switch (status) {
    case 401: case 403: return new ProviderError("auth", "The provider rejected the API key.", options);
    case 404: return new ProviderError("not_found", "The provider has no alliance with that reference.", options);
    case 409: return new ProviderError("ambiguous", "More than one alliance matched.", {
      ...options, matches: (body as { matches?: unknown } | null)?.matches ?? null,
    });
    case 429: return new ProviderError("rate_limited", "The provider's daily request limit was reached.", options);
    case 503: return new ProviderError("unavailable", "The provider is busy.", { ...options, retryable: true });
    case 504: return new ProviderError("timeout", "The provider took too long to answer.", { ...options, retryable: true });
    case 502: return new ProviderError("unavailable", "The provider could not prepare the answer.", { ...options, retryable: true });
    default: return new ProviderError(status >= 500 ? "unavailable" : "invalid_response",
      `Unexpected provider status ${status}.`, { ...options, retryable: status >= 500 });
  }
}

export function backoffMs(attempt: number, random = Math.random): number {
  return Math.min(8000, 1000 * 2 ** (attempt - 1)) + Math.floor(random() * 250);
}

export class LastAsylumTracker implements IntelProvider {
  readonly id = "lat";
  readonly synthetic = false;
  private readonly options: Required<Omit<LatOptions, "apiKey">> & { apiKey: string | undefined };

  constructor(options: LatOptions) {
    this.options = {
      apiKey: options.apiKey?.trim() || undefined,
      baseUrl: (options.baseUrl ?? LAT_BASE_URL).replace(/\/$/, ""),
      fetch: options.fetch ?? ((input, init) => fetch(input, init)),
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      timeoutMs: options.timeoutMs ?? 15000,
      maxAttempts: options.maxAttempts ?? 3,
      now: options.now ?? (() => new Date()),
    };
  }

  async fetchAlliance(externalId: string, options: { fresh?: boolean } = {}) {
    if (!/^[1-9]\d{0,18}$/.test(externalId)) throw new ProviderError("not_found", "Alliance id must be numeric.");
    return this.request(`/v1/alliances/${externalId}${options.fresh ? "?fresh=1" : ""}`);
  }

  async findAlliance(kingdom: number, tag: string) {
    if (!Number.isInteger(kingdom) || kingdom < 1) throw new ProviderError("not_found", "Kingdom must be a positive number.");
    const clean = tag.replace(/^\[|\]$/g, "").trim();
    if (!/^[\p{L}\p{N}_\-.]{1,16}$/u.test(clean)) throw new ProviderError("not_found", "Enter a valid alliance tag.");
    return this.request(`/v1/alliances/${kingdom}/${encodeURIComponent(clean)}`);
  }

  private async request(path: string): Promise<ProviderResult<NormalizedAlliance>> {
    const { apiKey, baseUrl, maxAttempts } = this.options;
    if (!apiKey) throw new ProviderError("missing_key", "No tracker API key is configured on the server.", { attempts: 0 });
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let response: Response;
      try {
        response = await this.options.fetch(baseUrl + path, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(this.options.timeoutMs),
          cache: "no-store",
        });
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        const failure = new ProviderError(timedOut ? "timeout" : "network",
          timedOut ? "The provider did not answer in time." : "The provider could not be reached.",
          { retryable: true, attempts: attempt });
        if (attempt < maxAttempts) { await this.options.sleep(backoffMs(attempt)); continue; }
        throw failure;
      }
      const body = await response.json().catch(() => null);
      const quota = parseQuota(response.headers, body);
      if (!response.ok) {
        const failure = errorFor(response.status, body, quota, attempt);
        if (failure.retryable && attempt < maxAttempts) { await this.options.sleep(backoffMs(attempt)); continue; }
        throw failure;
      }
      const warnings: string[] = [];
      const shape = responseShape(body);
      let data: NormalizedAlliance;
      try {
        data = normalizeAlliance(body, warnings);
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
        throw new ProviderError(error.code, error.message, { status: response.status, quota, attempts: attempt, shape });
      }
      const meta = envelope.safeParse(body);
      const ageSeconds = meta.success ? Math.round(meta.data.age_seconds ?? 0) : 0;
      const fetchedAt = this.options.now();
      return {
        data,
        fetchedAt,
        observedAt: new Date(fetchedAt.getTime() - ageSeconds * 1000),
        cached: meta.success ? meta.data.cached ?? response.headers.get("x-cache") !== "live" : true,
        ageSeconds,
        refreshing: meta.success ? meta.data.refreshing ?? false : false,
        quota,
        httpStatus: response.status,
        attempts: attempt,
        shape,
        warnings: [...new Set(warnings)],
      };
    }
  }
}
