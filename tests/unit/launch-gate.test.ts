import { describe, expect, it } from "vitest";
import { launchGateChecks, launchGateStatus } from "../../app/lib/launch-gate";

describe("launch gate", () => {
  it("requires every check to pass", () => {
    const keys = launchGateChecks.map(([key]) => key);
    expect(launchGateStatus(keys)).toEqual({ total: keys.length, complete: keys.length, ready: true });
    expect(launchGateStatus(keys.slice(1)).ready).toBe(false);
  });

  it("contains the required identity and security boundaries", () => {
    const keys = new Set(launchGateChecks.map(([key]) => key));
    for (const key of ["visitor", "founder", "creator", "investor", "scoped_admin", "superadmin", "suspended", "blocked", "cross_account", "private_media", "session", "request_security", "accessibility"]) {
      expect(keys.has(key as never)).toBe(true);
    }
  });
});
