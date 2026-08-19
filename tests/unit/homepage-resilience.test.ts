import { describe, expect, it, vi } from "vitest";
import {
  loadHomepageRolePresence,
  optionalHomepageValue,
} from "../../app/routes/home";

describe("homepage optional data resilience", () => {
  it("returns available optional data", async () => {
    await expect(
      optionalHomepageValue(() =>
        Promise.resolve({ title: "Available project" }),
      ),
    ).resolves.toEqual({ title: "Available project" });
  });

  it("returns null instead of taking down the public House", async () => {
    await expect(
      optionalHomepageValue(() =>
        Promise.reject(new Error("Optional production data is unavailable")),
      ),
    ).resolves.toBeNull();
  });

  it("loads approved totals and compact public previews for a requested role", async () => {
    const first = vi.fn().mockResolvedValue({ totalCount: 300 });
    const all = vi.fn().mockResolvedValue({
      results: [
        {
          username: "visible-creator",
          displayName: "Visible Creator",
          avatarKey: "profile-photos/creator/avatar.webp",
          publicCount: 12,
        },
      ],
    });
    const prepare = vi.fn((query: string) => ({
      bind: vi.fn(() =>
        query.includes("COUNT(DISTINCT u.id)") ? { first } : { all },
      ),
    }));
    const db = { prepare } as unknown as D1Database;

    await expect(loadHomepageRolePresence(db, "creator")).resolves.toEqual({
      totalCount: 300,
      publicCount: 12,
      members: [
        {
          username: "visible-creator",
          displayName: "Visible Creator",
          hasAvatar: true,
        },
      ],
    });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare.mock.calls[0]?.[0]).toContain("ma.status = 'approved'");
    expect(prepare.mock.calls[0]?.[0]).toContain(
      "COUNT(DISTINCT u.id) AS totalCount",
    );
    expect(prepare.mock.calls[1]?.[0]).toContain(
      "COALESCE(pv.visibility, p.visibility) = 'public'",
    );
    expect(prepare.mock.calls[1]?.[0]).toContain("LIMIT 4");
  });
});
