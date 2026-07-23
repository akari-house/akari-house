export interface MembershipEmailEnvironment {
  APP_URL?: string;
  RESEND_API_KEY?: string;
  MEMBERSHIP_FROM_EMAIL?: string;
}

async function sendEmail(
  env: MembershipEmailEnvironment,
  recipient: string,
  subject: string,
  html: string,
  text: string,
) {
  if (!env.RESEND_API_KEY || !env.MEMBERSHIP_FROM_EMAIL)
    return { sent: false as const, reason: "not-configured" as const };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MEMBERSHIP_FROM_EMAIL,
      to: [recipient],
      subject,
      html,
      text,
    }),
  });
  return response.ok
    ? { sent: true as const }
    : { sent: false as const, reason: "provider-error" as const };
}

export async function sendVerificationEmail(
  env: MembershipEmailEnvironment,
  recipient: string,
  token: string,
) {
  if (!env.APP_URL)
    return { sent: false as const, reason: "not-configured" as const };

  const verifyUrl = new URL("/verify-email", env.APP_URL);
  verifyUrl.searchParams.set("token", token);
  return sendEmail(
    env,
    recipient,
    "Confirm your AKARI House application",
    `<p>Confirm where we can reach you before your request enters review.</p><p><a href="${verifyUrl.toString()}">Confirm email</a></p><p>This link expires in 24 hours.</p>`,
    `Confirm your AKARI House application: ${verifyUrl.toString()}\n\nThis link expires in 24 hours.`,
  );
}

export async function sendPasswordResetEmail(
  env: MembershipEmailEnvironment,
  recipient: string,
  token: string,
) {
  if (!env.APP_URL)
    return { sent: false as const, reason: "not-configured" as const };
  const resetUrl = new URL("/reset-password", env.APP_URL);
  resetUrl.searchParams.set("token", token);
  return sendEmail(
    env,
    recipient,
    "Reset your AKARI House password",
    `<p>A password reset was requested for your AKARI House account.</p><p><a href="${resetUrl.toString()}">Choose a new password</a></p><p>This link expires in 30 minutes. Ignore this message if you did not request it.</p>`,
    `Reset your AKARI House password: ${resetUrl.toString()}\n\nThis link expires in 30 minutes.`,
  );
}

export async function sendApprovalEmail(
  env: MembershipEmailEnvironment,
  recipient: string,
) {
  if (!env.APP_URL)
    return { sent: false as const, reason: "not-configured" as const };
  const loginUrl = new URL("/login", env.APP_URL).toString();
  return sendEmail(
    env,
    recipient,
    "Your place in AKARI House is ready",
    `<p>Your membership request has been approved.</p><p><a href="${loginUrl}">Enter AKARI House</a></p>`,
    `Your membership request has been approved. Enter AKARI House: ${loginUrl}`,
  );
}
