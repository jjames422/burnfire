const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends a sign-in code through Resend. When no RESEND_API_KEY is configured
 * the code is logged to the server console instead so local development and
 * initial setup work without an email provider.
 */
export async function sendLoginCode(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
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
    const detail = await response.text().catch(() => "");
    throw new Error(`Email could not be sent (${response.status}): ${detail.slice(0, 200)}`);
  }
}
