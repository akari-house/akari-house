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
});
