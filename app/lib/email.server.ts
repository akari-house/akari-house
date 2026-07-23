export interface MembershipEmailEnvironment {
  APP_URL?: string;
  RESEND_API_KEY?: string;
  MEMBERSHIP_FROM_EMAIL?: string;
}

export async function sendVerificationEmail(
  env: MembershipEmailEnvironment,
  recipient: string,
  token: string,
) {
  if (!env.RESEND_API_KEY || !env.MEMBERSHIP_FROM_EMAIL || !env.APP_URL)
    return { sent: false as const, reason: "not-configured" as const };

  const verifyUrl = new URL("/verify-email", env.APP_URL);
  verifyUrl.searchParams.set("token", token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MEMBERSHIP_FROM_EMAIL,
      to: [recipient],
      subject: "Confirm your AKARI House application",
      html: `<p>Confirm where we can reach you before your request enters review.</p><p><a href="${verifyUrl.toString()}">Confirm email</a></p><p>This link expires in 24 hours.</p>`,
      text: `Confirm your AKARI House application: ${verifyUrl.toString()}\n\nThis link expires in 24 hours.`,
    }),
  });
  return response.ok
    ? { sent: true as const }
    : { sent: false as const, reason: "provider-error" as const };
}
