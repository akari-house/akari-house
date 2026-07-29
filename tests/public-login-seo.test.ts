import { describe, expect, it } from "vitest";
import {
  publicLoginFallbackResponse,
  publicLoginSuccessResponse,
} from "~/lib/public-login-fallback.server";

describe("Worker login SEO boundaries", () => {
  it("keeps the public login form out of search indexes", async () => {
    const response = publicLoginFallbackResponse(
      new Request("https://akarihouse.com/login"),
    );
    const body = await response.text();

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toContain(
      '<meta name="robots" content="noindex, nofollow">',
    );
    expect(body).toContain("<title>Log in · AKARI House</title>");
  });

  it("also noindexes the short-lived login success document", async () => {
    const response = publicLoginSuccessResponse(
      new Request("https://akarihouse.com/login"),
      "akari_session=test; Path=/; HttpOnly; Secure; SameSite=Lax",
      "/app",
    );
    const body = await response.text();

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(body).toContain(
      '<meta name="robots" content="noindex, nofollow">',
    );
    expect(body).toContain("<title>Opening AKARI House</title>");
  });
});
