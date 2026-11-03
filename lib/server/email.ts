const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends a sign-in code through Resend. When no RESEND_API_KEY is configured
 * local development may log the code instead. Production always requires
 * a configured provider and never logs authentication credentials.
 */
export async function sendLoginCode(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured.");
    console.log(`[auth] RESEND_API_KEY not set — sign-in code for ${email}: ${code}`);
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "BurnFire Community <onboarding@resend.dev>";
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is your BurnFire sign-in code`,
      text: [
        `Your BurnFire community sign-in code is: ${code}`,
        "",
        "It expires in 10 minutes. If you didn't request this, you can ignore this email.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error("Sign-in email delivery failed.");
  }
}

/** Magic links are never logged, including during local development. */
export async function sendLoginLink(email: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured.");
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "BurnFire Community <onboarding@resend.dev>",
      to: [email],
      subject: "Your secure BurnFire sign-in link",
      text: [
        "Continue to your BurnFire account:",
        url,
        "",
        "This one-time link expires in 10 minutes. Open it, then choose Continue to sign in.",
        "If you did not request this email, ignore it. Do not share this link.",
      ].join("\n"),
    }),
  });
  if (!response.ok) throw new Error("Sign-in email delivery failed.");
}

export async function sendRecruitInvitation(email: string, invitationUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM_EMAIL ?? "BurnFire Community <onboarding@resend.dev>";
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your BurnFire recruit academy invitation",
      text: [
        "You have been invited to join the BurnFire (BF2) recruit academy.",
        "",
        "Use this one-time link to begin onboarding:",
        invitationUrl,
        "",
        "The invitation expires in 14 days. You can complete training on the website; optional chat participation is not required.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error("Recruit invitation email delivery failed.");
  }
  return true;
}
