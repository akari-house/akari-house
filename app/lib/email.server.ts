import {
  deliveryStatus,
  enqueueEmailDelivery,
  processDeliveryOutbox,
} from "./delivery-outbox.server";
import { sha256 } from "./security.server";

export interface MembershipEmailEnvironment {
  APP_URL?: string;
  RESEND_API_KEY?: string;
  MEMBERSHIP_FROM_EMAIL?: string;
}

type EmailEnvironment = CloudflareEnvironment & MembershipEmailEnvironment;

type EmailResult =
  | { sent: true; deliveryId: string }
  | { sent: false; reason: "not-configured" | "queued"; deliveryId?: string };

async function queueEmail(
  env: EmailEnvironment,
  input: {
    recipient: string;
    messageType: string;
    idempotencyMaterial: string;
    subject: string;
    html: string;
    text: string;
  },
): Promise<EmailResult> {
  if (!env.APP_URL)
    return { sent: false, reason: "not-configured" } as const;
  const [recipientReference, materialHash] = await Promise.all([
    sha256(input.recipient.trim().toLowerCase()),
    sha256(input.idempotencyMaterial),
  ]);
  const queued = await enqueueEmailDelivery(env, {
    messageType: input.messageType,
    recipientReference,
    idempotencyKey: `email:${input.messageType}:${recipientReference}:${materialHash}`,
    payload: {
      recipient: input.recipient,
      subject: input.subject,
      html: input.html,
      text: input.text,
    },
  });
  await processDeliveryOutbox(env, { onlyId: queued.id, limit: 1 });
  const result = await deliveryStatus(env.DB, queued.id);
  return result?.status === "delivered"
    ? { sent: true, deliveryId: queued.id }
    : { sent: false, reason: "queued", deliveryId: queued.id };
}

export async function sendVerificationEmail(
  env: EmailEnvironment,
  recipient: string,
  token: string,
) {
  if (!env.APP_URL)
    return { sent: false as const, reason: "not-configured" as const };
  const verifyUrl = new URL("/verify-email", env.APP_URL);
  verifyUrl.searchParams.set("token", token);
  return queueEmail(env, {
    recipient,
    messageType: "membership_verification",
    idempotencyMaterial: token,
    subject: "Confirm your AKARI House application",
    html: `<p>Confirm where we can reach you before your request enters review.</p><p><a href="${verifyUrl.toString()}">Confirm email</a></p><p>This link expires in 24 hours.</p>`,
    text: `Confirm your AKARI House application: ${verifyUrl.toString()}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail(
  env: EmailEnvironment,
  recipient: string,
  token: string,
) {
  if (!env.APP_URL)
    return { sent: false as const, reason: "not-configured" as const };
  const resetUrl = new URL("/reset-password", env.APP_URL);
  resetUrl.searchParams.set("token", token);
  return queueEmail(env, {
    recipient,
    messageType: "password_reset",
    idempotencyMaterial: token,
    subject: "Reset your AKARI House password",
    html: `<p>A password reset was requested for your AKARI House account.</p><p><a href="${resetUrl.toString()}">Choose a new password</a></p><p>This link expires in 30 minutes. Ignore this message if you did not request it.</p>`,
    text: `Reset your AKARI House password: ${resetUrl.toString()}\n\nThis link expires in 30 minutes.`,
  });
}

export async function sendApprovalEmail(
  env: EmailEnvironment,
  recipient: string,
) {
  if (!env.APP_URL)
    return { sent: false as const, reason: "not-configured" as const };
  const loginUrl = new URL("/login", env.APP_URL).toString();
  return queueEmail(env, {
    recipient,
    messageType: "membership_approval",
    idempotencyMaterial: "approved",
    subject: "Your place in AKARI House is ready",
    html: `<p>Your membership request has been approved.</p><p><a href="${loginUrl}">Enter AKARI House</a></p>`,
    text: `Your membership request has been approved. Enter AKARI House: ${loginUrl}`,
  });
}
