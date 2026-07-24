import { describe, expect, it } from "vitest";
import {
  isSafeReturnPath,
  productionSecurityHeaders,
  validateImageUpload,
} from "../../app/lib/production-security.server";

describe("production security", () => {
  it("returns hardened browser headers", () => {
    const headers = productionSecurityHeaders();
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
  });

  it("rejects unsafe return paths", () => {
    expect(isSafeReturnPath("/app")).toBe(true);
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("https://evil.example")).toBe(false);
    expect(isSafeReturnPath("/safe\\evil")).toBe(false);
  });

  it("validates profile image type and size", () => {
    const good = new File([new Uint8Array(64)], "avatar.webp", {
      type: "image/webp",
    });
    const badType = new File([new Uint8Array(64)], "avatar.svg", {
      type: "image/svg+xml",
    });
    const tooLarge = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "large.png",
      {
        type: "image/png",
      },
    );
    expect(validateImageUpload(good).ok).toBe(true);
    expect(validateImageUpload(badType).ok).toBe(false);
    expect(validateImageUpload(tooLarge).ok).toBe(false);
  });
});
