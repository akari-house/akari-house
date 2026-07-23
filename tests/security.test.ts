import { describe, expect, it } from "vitest";
import {
  assertSameOrigin,
  hashPassword,
  verifyPassword,
} from "~/lib/security.server";

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
});
