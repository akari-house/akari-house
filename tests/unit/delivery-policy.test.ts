import { describe, expect, it } from "vitest";
import {
  deliveryErrorCategory,
  deliveryFailureStatus,
  deliveryRetryDelaySeconds,
  sanitizeDeliveryError,
} from "../../app/lib/delivery-policy";

describe("delivery retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(deliveryRetryDelaySeconds(1)).toBe(60);
    expect(deliveryRetryDelaySeconds(2)).toBe(300);
    expect(deliveryRetryDelaySeconds(3)).toBe(1_800);
    expect(deliveryRetryDelaySeconds(4)).toBe(7_200);
    expect(deliveryRetryDelaySeconds(99)).toBe(21_600);
  });

  it("moves exhausted deliveries to dead letter", () => {
    expect(deliveryFailureStatus(4, 5)).toBe("failed");
    expect(deliveryFailureStatus(5, 5)).toBe("dead_letter");
  });

  it("removes credentials and account tokens from operator errors", () => {
    const sanitized = sanitizeDeliveryError(
      "Bearer secret-value https://example.test/reset?token=abcdef&next=1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    expect(sanitized).not.toContain("secret-value");
    expect(sanitized).not.toContain("abcdef");
    expect(sanitized).not.toContain(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  it("classifies common provider failures", () => {
    expect(deliveryErrorCategory(new Error("Resend HTTP 503"))).toBe(
      "provider_unavailable",
    );
    expect(deliveryErrorCategory(new Error("Telegram HTTP 400"))).toBe(
      "provider_rejected",
    );
    expect(deliveryErrorCategory(new Error("request timed out"))).toBe(
      "timeout",
    );
  });
});
