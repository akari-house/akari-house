import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const defaultConfig = readFileSync("wrangler.jsonc", "utf8");
const productionWorkflow = readFileSync(
  ".github/workflows/deploy-production.yml",
  "utf8",
);

const productionDatabaseId = "183409bf-cd4a-4867-875e-11ae04d91ee5";

describe("Cloudflare deployment isolation", () => {
  it("keeps the connected AKARI Worker on production storage", () => {
    expect(defaultConfig).toContain('"name": "akari-house"');
    expect(defaultConfig).toContain('"APP_ENV": "production"');
    expect(defaultConfig).toContain(
      '"APP_URL": "https://akarihouse.com"',
    );
    expect(defaultConfig).toContain('"TURNSTILE_HOSTNAME": "akarihouse.com"');
    expect(defaultConfig).toContain('"database_name": "akari-house-db"');
    expect(defaultConfig).toContain(`"database_id": "${productionDatabaseId}"`);
    expect(defaultConfig).toContain('"bucket_name": "akari-house-media"');
    expect(defaultConfig).not.toContain("akari-house-preview-db");
    expect(defaultConfig).not.toContain("akari-house-preview-media");
  });

  it("keeps the main deployment independently validated and authenticated", () => {
    expect(productionWorkflow).toContain("branches:\n      - main");
    expect(productionWorkflow).toContain('name: "akari-house"');
    expect(productionWorkflow).toContain('APP_ENV: "production"');
    expect(productionWorkflow).toContain('APP_URL: "https://akarihouse.com"');
    expect(productionWorkflow).toContain('database_name: "akari-house-db"');
    expect(productionWorkflow).toContain('bucket_name: "akari-house-media"');
    expect(productionWorkflow).toContain(
      "Prove member dashboard and Superadmin access on the custom domain",
    );
    expect(productionWorkflow).toContain(
      "Generated deployment is production-safe",
    );
  });
});
