import { describe, expect, it } from "vitest";
import {
  buildProfileQrMatrix,
  profileQrPath,
  PROFILE_QR_MAX_BYTES,
  PROFILE_QR_MODULES,
  PROFILE_QR_QUIET_ZONE,
} from "../../app/lib/qr-code";

describe("AKARI profile QR generator", () => {
  it("builds a deterministic Version 5 matrix with finder patterns", () => {
    const value = "https://akarihouse.com/profiles/muazxinthi";
    const first = buildProfileQrMatrix(value);
    const second = buildProfileQrMatrix(value);

    expect(first).toEqual(second);
    expect(first).toHaveLength(PROFILE_QR_MODULES);
    expect(first.every((row) => row.length === PROFILE_QR_MODULES)).toBe(true);
    expect(first[0].slice(0, 7)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(first[1].slice(0, 7)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(profileQrPath(first, PROFILE_QR_QUIET_ZONE)).toContain(
      "M4 4h1v1h-1z",
    );
  });

  it("keeps encoded profile URLs inside the fixed safe capacity", () => {
    expect(PROFILE_QR_MAX_BYTES).toBe(106);
    expect(() => buildProfileQrMatrix("x".repeat(PROFILE_QR_MAX_BYTES))).not.toThrow();
    expect(() =>
      buildProfileQrMatrix("x".repeat(PROFILE_QR_MAX_BYTES + 1)),
    ).toThrow(/exceeds 106 UTF-8 bytes/);
  });
});
