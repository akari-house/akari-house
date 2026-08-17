import { describe, expect, it } from "vitest";
import {
  assertSameOrigin,
  hashPassword,
  verifyPassword,
} from "~/lib/security.server";
import {
  isSafeReturnPath,
  productionSecurityHeaders,
} from "~/lib/production-security.server";

describe("authentication security", () => {
  it("hashes and verifies passwords without storing the plaintext", async () => {
    const password = "A-strong-test-password-2026";
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("accepts same-origin form submissions", () => {
    const request = new Request("https://akari.example/app", {
      headers: { Origin: "https://akari.example" },
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects missing and cross-origin form origins", () => {
    expect(() =>
      assertSameOrigin(new Request("https://akari.example/app")),
    ).toThrow();
    const foreign = new Request("https://akari.example/app", {
      headers: { Origin: "https://attacker.example" },
    });
    expect(() => assertSameOrigin(foreign)).toThrow();
  });

  it("only accepts local return paths", () => {
    expect(isSafeReturnPath("/app")).toBe(true);
    expect(isSafeReturnPath("/workspace-invitations/accept?token=test")).toBe(
      true,
    );
    expect(isSafeReturnPath("https://attacker.example")).toBe(false);
    expect(isSafeReturnPath("//attacker.example")).toBe(false);
    expect(isSafeReturnPath("/\\attacker.example")).toBe(false);
    expect(isSafeReturnPath("/app\u0000evil")).toBe(false);
  });

  it("ships the hardened production browser policy", () => {
    const headers = productionSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain("form-action 'self'");
    expect(headers["Strict-Transport-Security"]).toContain("includeSubDomains");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Permissions-Policy"]).toContain("payment=()");
  });
});
