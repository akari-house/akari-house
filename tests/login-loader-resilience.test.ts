import { afterEach, describe, expect, it, vi } from "vitest";
import { getLoginPageData } from "~/routes/login";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login page loader", () => {
  it("renders without consulting session or database storage", () => {
    const context = {
      get: vi.fn(() => ({
        env: {
          TURNSTILE_SITE_KEY: "test-site-key",
          get DB() {
            throw new Error("The login page must not read D1 on GET");
          },
        },
      })),
    };

    expect(getLoginPageData(context as never)).toEqual({
      siteKey: "test-site-key",
    });
  });

  it("still renders when the Cloudflare environment is temporarily unavailable", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const context = {
      get: vi.fn(() => {
        throw new Error("Cloudflare context unavailable");
      }),
    };

    expect(getLoginPageData(context as never)).toEqual({ siteKey: undefined });
    expect(error).toHaveBeenCalledWith(
      "Login page environment lookup failed; rendering without Turnstile until the binding is restored.",
      expect.any(Error),
    );
  });
});
