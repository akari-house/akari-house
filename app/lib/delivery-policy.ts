const retryScheduleSeconds = [60, 300, 1_800, 7_200, 21_600] as const;

export type DeliveryFailureStatus = "failed" | "dead_letter";

export function deliveryRetryDelaySeconds(attemptCount: number) {
  const index = Math.max(
    0,
    Math.min(attemptCount - 1, retryScheduleSeconds.length - 1),
  );
  return retryScheduleSeconds[index];
}

export function deliveryFailureStatus(
  attemptCount: number,
  maxAttempts: number,
): DeliveryFailureStatus {
  return attemptCount >= maxAttempts ? "dead_letter" : "failed";
}

export function sanitizeDeliveryError(error: unknown) {
  const raw =
    error instanceof Error ? error.message : String(error || "Unknown error");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|code|key|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b[a-f0-9]{64}\b/gi, "[redacted-token]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 300);
}

export function deliveryErrorCategory(error: unknown) {
  const message = sanitizeDeliveryError(error).toLowerCase();
  if (message.includes("not configured")) return "configuration";
  if (message.includes("timeout") || message.includes("timed out"))
    return "timeout";
  if (message.includes("recipient") || message.includes("linked account"))
    return "recipient";
  if (/http\s+4\d\d/.test(message)) return "provider_rejected";
  if (/http\s+5\d\d/.test(message)) return "provider_unavailable";
  return "provider_error";
}
