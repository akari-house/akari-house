import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { productionCheckDefinitions } from "~/lib/production-readiness";

describe("R77 launch hardening", () => {
  it("requires human real-device, visual and analytics/privacy evidence", () => {
    const keys = productionCheckDefinitions.map((check) => check.key);
    expect(keys).toContain("real_device_auth");
    expect(keys).toContain("human_visual_review");
    expect(keys).toContain("analytics_privacy");
  });

  it("keeps the Turnstile server gate intact while making the client responsive", async () => {
    const source = await readFile("app/components/TurnstileWidget.tsx", "utf8");
    expect(source).toContain(
      'size: window.matchMedia("(max-width: 360px)").matches',
    );
    expect(source).toContain('? "compact"');
    expect(source).toContain(': "flexible"');
    expect(source).toContain('"error-callback"');
    expect(source).toContain('"refresh-expired": "auto"');
    expect(source).not.toContain("siteverify");
  });

  it("keeps core House chapters rendered while deferring only the optional epilogue", async () => {
    const css = await readFile("app/styles/r77-launch-completion.css", "utf8");
    expect(css).toContain("content-visibility: auto");
    expect(css).toContain(".final-welcome");
    expect(css).not.toContain(".common-section");
    expect(css).not.toContain(".journey-section");
    expect(css).not.toContain(".archive-section");
    expect(css).not.toContain(".arrival {\n    content-visibility");
  });

  it("stores pilot evidence additively without creating synthetic participants", async () => {
    const migration = await readFile(
      "migrations/0124_launch_completion_pilot.sql",
      "utf8",
    );
    expect(migration).toContain("CREATE TABLE pilot_participants");
    expect(migration).toContain("UNIQUE (cohort_id, user_id)");
    expect(migration).toContain("CREATE TABLE pilot_task_results");
    expect(migration).not.toMatch(/INSERT\s+INTO\s+pilot_participants/i);
  });

  it("keeps Cloudflare browser analytics outside the production audit posture", async () => {
    const audit = await readFile("scripts/production-public-audit.mjs", "utf8");
    expect(audit).toContain("static.cloudflareinsights.com");
    expect(audit).toContain("Unexpected browser analytics injection");
    expect(audit).toContain("CSP remains narrow");
  });
});
