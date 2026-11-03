// Fetch helpers for the site's own API routes (no third-party backend).

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const headers =
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers };
    const response = await fetch(path, { ...init, headers });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        data: null,
        error:
          (json as { error?: string } | null)?.error ??
          `Request failed (${response.status}).`,
      };
    }
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: "Network error. Check your connection." };
  }
}

export function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}
