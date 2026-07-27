import { describe, expect, it } from "vitest";
import {
  publicLoginFallbackResponse,
  shouldServePublicLoginFallback,
} from "~/lib/public-login-fallback.server";

describe("Worker-level public login fallback", () => {
  it("intercepts only GET requests for /login", () => {
    expect(
      shouldServePublicLoginFallback(
        new Request("https://akarihouse.com/login", { method: "GET" }),
      ),
    ).toBe(true);
    expect(
      shouldServePublicLoginFallback(
        new Request("https://akarihouse.com/login", { method: "POST" }),
      ),
    ).toBe(false);
    expect(
      shouldServePublicLoginFallback(
        new Request("https://akarihouse.com/register", { method: "GET" }),
      ),
    ).toBe(false);
  });

  it("returns the real login form without React Router SSR", async () => {
    const response = publicLoginFallbackResponse(
      new Request("https://akarihouse.com/login?returnTo=%2Fapp"),
      "test-site-key",
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-akari-login-fallback")).toBe("worker");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toContain("Return to the House");
    expect(body).toContain('name="email"');
    expect(body).toContain('name="password"');
    expect(body).toContain('data-sitekey="test-site-key"');
    expect(body).toContain('action="/login?returnTo=%2Fapp"');
    expect(body).not.toContain("The lantern went out unexpectedly");
  });
});
