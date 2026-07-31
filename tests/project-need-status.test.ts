import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseProjectNeedStatuses,
  projectHasAnyOpenNeed,
  projectHasOpenNeed,
  projectNeedPublicLabel,
  projectNeedStatusFromForm,
  updateProjectNeedStatus,
} from "../app/lib/project-need-status";

const read = (path: string) => readFileSync(path, "utf8");

describe("Founder-reported project support outcomes", () => {
  it("records completed fundraising with accurate external attribution", () => {
    const value = updateProjectNeedStatus(
      "{}",
      "fundraising",
      "completed",
      "external",
      "Seed round completed in July 2026.",
      "2026-07-31T12:00:00.000Z",
    );
    const record = parseProjectNeedStatuses(value).fundraising;

    expect(record).toMatchObject({
      status: "completed",
      source: "external",
      note: "Seed round completed in July 2026.",
    });
    expect(projectNeedPublicLabel("fundraising", record!)).toBe(
      "Round completed · External investors",
    );
  });

  it("removes the stored outcome when a need is reopened", () => {
    const completed = updateProjectNeedStatus(
      "{}",
      "community",
      "completed",
      undefined,
      "Community launch completed.",
      "2026-07-31T12:00:00.000Z",
    );
    const reopened = updateProjectNeedStatus(
      completed,
      "community",
      "open",
      undefined,
      "",
      "2026-07-31T13:00:00.000Z",
    );

    expect(parseProjectNeedStatuses(reopened).community).toBeUndefined();
    expect(
      projectHasOpenNeed("Community building", reopened, "community"),
    ).toBe(true);
  });

  it("keeps a project visible while reporting that no selected needs are open", () => {
    const status = JSON.stringify({
      fundraising: { status: "closed" },
      partnerships: { status: "completed" },
    });
    expect(
      projectHasAnyOpenNeed(
        "Fundraising · Strategic partnerships",
        status,
      ),
    ).toBe(false);
  });

  it("requires fundraising attribution only when a round is completed", () => {
    const form = new FormData();
    form.set("projectNeed", "fundraising");
    form.set("needStatus", "completed");
    form.set("fundraisingSource", "");

    expect(
      projectNeedStatusFromForm(form, "Fundraising").error,
    ).toContain("Choose where");

    form.set("fundraisingSource", "mixed");
    expect(projectNeedStatusFromForm(form, "Fundraising")).toMatchObject({
      error: null,
      need: "fundraising",
      status: "completed",
      source: "mixed",
    });
  });

  it("gates new fundraising actions while preserving existing authorised access", () => {
    const projectDetail = read("app/routes/project-detail.tsx");
    const dealRoom = read("app/routes/deal-room.tsx");
    const projects = read("app/routes/projects.tsx");

    expect(projectDetail).toContain("if (fundraisingClosed)");
    expect(dealRoom).toContain(
      'return { error: "This fundraising round is not currently open." }',
    );
    expect(dealRoom).toContain("Existing saved records and authorised access");
    expect(projects).toContain("projectHasOpenNeed");
  });

  it("adds one lightweight project field and audits Founder changes", () => {
    const migration = read("migrations/0110_project_need_status.sql");
    const route = read("app/routes/project-needs.tsx");

    expect(migration).toContain("support_status_json");
    expect(route).toContain("project.need_status_updated");
    expect(route).toContain("Founder-reported progress");
  });
});
