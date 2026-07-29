import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/routes/admin-operations.tsx", "utf8");
const styles = readFileSync(
  "app/styles/admin-operations-spacing.css",
  "utf8",
);
const root = readFileSync("app/root.tsx", "utf8");

describe("admin operations section rhythm", () => {
  it("keeps direct operations panels visually separated", () => {
    expect(route).toContain("admin-main admin-operations-main");
    expect(styles).toContain(
      ".admin-operations-main > section + section",
    );
    expect(styles).toContain("margin-top: var(--app-section-gap)");
    expect(root).toContain(
      'import "./styles/admin-operations-spacing.css";',
    );
  });
});
