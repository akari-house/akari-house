import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const previewConfig = JSON.parse(
  readFileSync("wrangler.jsonc", "utf8"),
) as {
  name: string;
  vars: Record<string, string>;
  triggers?: unknown;
  d1_databases: Array<{ database_name: string }>;
  r2_buckets: Array<{ bucket_name: string }>;
};
const productionWorkflow = readFileSync(
  ".github/workflows/deploy-production.yml",
  "utf8",
);

describe("Cloudflare deployment isolation", () => {
  it("keeps the checked-in Wrangler configuration outside production", () => {
    expect(previewConfig.name).toBe("akari-house-preview");
    expect(previewConfig.vars.APP_ENV).toBe("preview");
    expect(previewConfig.vars.APP_URL).not.toBe("https://akarihouse.com");
    expect(previewConfig.triggers).toBeUndefined();
    expect(previewConfig.d1_databases[0]?.database_name).toBe(
      "akari-house-preview-db",
    );
    expect(previewConfig.r2_buckets[0]?.bucket_name).toBe(
      "akari-house-preview-media",
    );
  });

  it("keeps production configuration explicit in the main-only workflow", () => {
    expect(productionWorkflow).toContain("branches:\n      - main");
    expect(productionWorkflow).toContain('name: "akari-house"');
    expect(productionWorkflow).toContain('APP_ENV: "production"');
    expect(productionWorkflow).toContain(
      'APP_URL: "https://akarihouse.com"',
    );
    expect(productionWorkflow).toContain('database_name: "akari-house-db"');
    expect(productionWorkflow).toContain(
      'bucket_name: "akari-house-media"',
    );
  });
});
