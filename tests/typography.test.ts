import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(entry.name)
        ? [path]
        : [];
  });
}

describe("public typography", () => {
  it("does not use en or em dashes in interface source", () => {
    const offenders = sourceFiles("app").filter((path) =>
      /[\u2013\u2014]/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("loads the compact inner-page design layer last", () => {
    const root = readFileSync("app/root.tsx", "utf8");
    const styles = readFileSync("app/styles/site-final-polish.css", "utf8");

    expect(root.trimEnd()).toContain(
      'import "./styles/site-final-polish.css";',
    );
    expect(styles).toContain(
      "--app-heading-xl: clamp(2.15rem, 3.6vw, 3.25rem)",
    );
    expect(styles).toContain(".archive-hero h1");
    expect(styles).toContain("font-size: clamp(2.35rem, 4vw, 3.5rem)");
    expect(styles).toContain(".people-page .section-intro h2");
    expect(styles).toContain("font-size: clamp(1.75rem, 2.8vw, 2.45rem)");
  });

  it("does not apply display-heading sizing to the profile description", () => {
    const consistency = readFileSync(
      "app/styles/product-ui-consistency.css",
      "utf8",
    );
    expect(consistency).not.toMatch(
      /\.profile-headline,\s*\.project-detail-main h1/,
    );
    expect(consistency).toContain(".public-profile h1");
  });
});
