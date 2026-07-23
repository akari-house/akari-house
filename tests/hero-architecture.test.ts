import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("arrival hero architecture", () => {
  it("renders one uninterrupted hero image without clipped duplicate layers", () => {
    const source = readFileSync(
      "app/components/house/InteractiveArrival.tsx",
      "utf8",
    );
    expect(source.match(/className="arrival-scene"/g)).toHaveLength(1);
    expect(source).toContain("/assets/optimized/arrival.webp");
    expect(source).not.toContain("arrival-scene-base");
    expect(source).not.toContain("arrival-scene-foreground");
    expect(source).not.toContain("arrival-scene-sanctuary");
  });
});
