// Provider-neutral contracts for external game statistics.
// Nothing here may carry map coordinates or online/offline status: the
// normalized shapes simply have no place for them.

export type ProviderErrorCode =
  | "missing_key"
  | "auth"
  | "not_found"
  | "ambiguous"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "network"
  | "invalid_response";

export interface ProviderQuota {
  limit: number | null;
  remaining: number | null;
  resets: string | null;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly quota: ProviderQuota | null;
  readonly attempts: number;
  readonly matches: unknown;

  constructor(code: ProviderErrorCode, message: string, options: {
    status?: number | null; retryable?: boolean; quota?: ProviderQuota | null; attempts?: number; matches?: unknown;
  } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.quota = options.quota ?? null;
    this.attempts = options.attempts ?? 1;
    this.matches = options.matches ?? null;
  }
}

export interface NormalizedMember {
  /** Stable provider character id (decimal string; exceeds 32 bits). */
  uid: string;
  name: string;
  power: number | null;
  sanctuaryLevel: number | null;
  dailyHonor: number | null;
  dailyTech: number | null;
  weeklyActivity: number | null;
  joinedAt: string | null;
  /** Used only for a tenant's own current members; never stored as history. */
  lastOnlineAt: string | null;
}

export interface NormalizedAlliance {
  externalId: string;
  kingdom: number | null;
  tag: string;
  name: string;
  level: number | null;
  memberCount: number;
  /** False when the provider answer had no roster array at all. */
  rosterIncluded: boolean;
  members: NormalizedMember[];
}

export interface ProviderResult<T> {
  data: T;
  fetchedAt: Date;
  /** When the provider's copy was taken from the game (fetchedAt - age). */
  observedAt: Date;
  cached: boolean;
  ageSeconds: number;
  refreshing: boolean;
  quota: ProviderQuota;
  httpStatus: number;
  attempts: number;
  /** Field names seen in the response (never values), for schema review. */
  shape: string[];
  warnings: string[];
}

export interface IntelProvider {
  readonly id: string;
  readonly synthetic: boolean;
  fetchAlliance(externalId: string, options?: { fresh?: boolean }): Promise<ProviderResult<NormalizedAlliance>>;
  findAlliance(kingdom: number, tag: string): Promise<ProviderResult<NormalizedAlliance>>;
}

/** Removes API keys and bearer tokens from any text bound for storage or logs. */
export function redactSecrets(text: string): string {
  return text
    .replace(/lap_[A-Za-z0-9_\-]+/g, "lap_[redacted]")
    .replace(/(bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[redacted]")
    .replace(/(x-api-key["':\s=]+)[A-Za-z0-9._\-]+/gi, "$1[redacted]")
    .slice(0, 300);
}
