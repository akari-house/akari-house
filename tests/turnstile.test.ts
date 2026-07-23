import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "~/lib/turnstile.server";

afterEach(() => vi.unstubAllGlobals());

function request() {
  return new Request("https://akari.example/register", {
    headers: { "CF-Connecting-IP": "192.0.2.1" },
  });
}

describe("Turnstile verification", () => {
  it("fails closed in production when configuration or token is missing", async () => {
    expect(
      await verifyTurnstile(
        request(),
        new FormData(),
        { APP_ENV: "production" },
        "membership_request",
      ),
    ).toBe(false);
  });

  it("allows an explicit development-only bypass", async () => {
    expect(
      await verifyTurnstile(
        request(),
        new FormData(),
        { APP_ENV: "development" },
        "membership_request",
      ),
    ).toBe(true);
  });

  it("requires both provider success and the expected action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            success: true,
            action: "membership_request",
            hostname: "akari.example",
          }),
        ),
      ),
    );
    const formData = new FormData();
    formData.set("cf-turnstile-response", "valid-token");
    expect(
      await verifyTurnstile(
        request(),
        formData,
        {
          APP_ENV: "production",
          TURNSTILE_SECRET_KEY: "secret",
          TURNSTILE_HOSTNAME: "akari.example",
        },
        "membership_request",
      ),
    ).toBe(true);
    expect(
      await verifyTurnstile(
        request(),
        formData,
        {
          APP_ENV: "production",
          TURNSTILE_SECRET_KEY: "secret",
          TURNSTILE_HOSTNAME: "akari.example",
        },
        "login",
      ),
    ).toBe(false);
  });
});
