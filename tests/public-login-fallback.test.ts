import { describe, expect, it } from "vitest";
import { isPublicLoginRequest } from "~/lib/public-login-handler.server";
import {
  publicLoginFallbackResponse,
  publicLoginRelease,
} from "~/lib/public-login-fallback.server";

describe("Worker-level public login", () => {
  it("routes both GET and POST /login requests through the Worker handler", () => {
    expect(
      isPublicLoginRequest(
        new Request("https://akarihouse.com/login", { method: "GET" }),
      ),
    ).toBe(true);
    expect(
      isPublicLoginRequest(
        new Request("https://akarihouse.com/login", { method: "POST" }),
      ),
    ).toBe(true);
    expect(
      isPublicLoginRequest(
        new Request("https://akarihouse.com/register", { method: "GET" }),
      ),
    ).toBe(false);
  });

  it("returns the real versioned login form without React Router SSR", async () => {
    const response = publicLoginFallbackResponse(
      new Request("https://akarihouse.com/login?returnTo=%2Fapp"),
      "test-site-key",
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-akari-login-fallback")).toBe("worker");
    expect(response.headers.get("x-akari-login-release")).toBe(
      publicLoginRelease,
    );
    expect(response.headers.get("x-akari-login-result")).toBe("form");
    expect(response.headers.get("x-akari-login-stage")).toBe("form");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toContain("Return to the House");
    expect(body).toContain('name="email"');
    expect(body).toContain('name="password"');
    expect(body).toContain('data-sitekey="test-site-key"');
    expect(body).toContain('action="/login?returnTo=%2Fapp"');
    expect(body).not.toContain("The lantern went out unexpectedly");
  });

  it("shows a visible, escaped and staged authentication error", async () => {
    const response = publicLoginFallbackResponse(
      new Request("https://akarihouse.com/login"),
      "test-site-key",
      {
        error: "The email or password was not recognised. <retry>",
        email: 'member+test@example.com" autofocus',
        status: 401,
        stage: "password",
      },
    );
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(response.headers.get("x-akari-login-release")).toBe(
      publicLoginRelease,
    );
    expect(response.headers.get("x-akari-login-result")).toBe("error");
    expect(response.headers.get("x-akari-login-stage")).toBe("password");
    expect(body).toContain('role="alert"');
    expect(body).toContain(
      "The email or password was not recognised. &lt;retry&gt;",
    );
    expect(body).toContain('value="member+test@example.com&quot; autofocus"');
    expect(body).not.toContain("<retry>");
  });
});
