import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "../../app/lib/turnstile.server";

describe("verifyTurnstile local safety", () => {
  it.each([
    "http://localhost/register",
    "http://127.0.0.1:5173/register",
  ])("allows a secretless local request at %s", async (url) => {
    await expect(
      verifyTurnstile(new Request(url), new FormData(), {}, "membership_request"),
    ).resolves.toBe(true);
  });

  it("fails closed on a non-local host when the secret is missing", async () => {
    await expect(
      verifyTurnstile(
        new Request("https://akari.club/register"),
        new FormData(),
        { APP_ENV: "production" },
        "membership_request",
      ),
    ).resolves.toBe(false);
  });
});
