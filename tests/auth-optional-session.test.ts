import { afterEach, describe, expect, it, vi } from "vitest";
import { getOptionalUser, requireUser } from "~/lib/auth.server";

function requestWithCookie(value: string) {
  return new Request("https://akarihouse.com/projects", {
    headers: { Cookie: value },
  });
}

function failingDb(message = "D1 session schema unavailable") {
  return {
    prepare() {
      throw new Error(message);
    },
  } as unknown as D1Database;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("optional session resilience", () => {
  it("treats a malformed session cookie as signed out without querying D1", async () => {
    const prepare = vi.fn(() => {
      throw new Error("D1 should not be queried for an undecodable cookie");
    });
    const db = { prepare } as unknown as D1Database;

    await expect(
      getOptionalUser(
        requestWithCookie("akari_session=%E0%A4%A"),
        db,
      ),
    ).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("keeps public requests signed out when an optional session lookup fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      getOptionalUser(
        requestWithCookie("akari_session=stale-session-token"),
        failingDb(),
      ),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "Optional session lookup failed; treating the request as signed out.",
      expect.any(Error),
    );
  });

  it("keeps protected routes fail-closed when session storage is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await requireUser(
        requestWithCookie("akari_session=stale-session-token"),
        failingDb(),
      );
      throw new Error("requireUser should redirect signed-out requests");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "/login?returnTo=%2Fprojects",
      );
    }
  });
});
