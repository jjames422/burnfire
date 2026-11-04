export const ACCOUNT_HINT_COOKIE = "bf_account_known";

/** Presentation only: this cookie never grants access or identifies an account. */
export function accountHintOptions(hostname: string, secure: boolean) {
  const sharedDomain = hostname === "burnfire2.com" || hostname.endsWith(".burnfire2.com");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    ...(sharedDomain ? { domain: "burnfire2.com" } : {}),
  };
}
