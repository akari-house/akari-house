import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const previewConfig = readFileSync("wrangler.jsonc", "utf8");
const productionWorkflow = readFileSync(
  ".github/workflows/deploy-production.yml",
  "utf8",
);

describe("Cloudflare deployment isolation", () => {
  it("keeps the checked-in Wrangler configuration outside production", () => {
    expect(previewConfig).toContain('"name": "akari-house-preview"');
    expect(previewConfig).toContain('"APP_ENV": "preview"');
    expect(previewConfig).toContain('"APP_URL": "http://localhost:5173"');
    expect(previewConfig).not.toContain('"APP_ENV": "production"');
    expect(previewConfig).not.toContain('"APP_URL": "https://akarihouse.com"');
    expect(previewConfig).not.toContain('"triggers"');
    expect(previewConfig).toContain(
      '"database_name": "akari-house-preview-db"',
    );
    expect(previewConfig).toContain(
      '"bucket_name": "akari-house-preview-media"',
    );
  });

  it("keeps production configuration explicit in the main-only workflow", () => {
    expect(productionWorkflow).toContain("branches:\n      - main");
    expect(productionWorkflow).toContain('name: "akari-house"');
    expect(productionWorkflow).toContain('APP_ENV: "production"');
    expect(productionWorkflow).toContain('APP_URL: "https://akarihouse.com"');
    expect(productionWorkflow).toContain('database_name: "akari-house-db"');
    expect(productionWorkflow).toContain('bucket_name: "akari-house-media"');
  });
});
