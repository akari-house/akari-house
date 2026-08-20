import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = readFileSync("app/root.tsx", "utf8");
const polish = readFileSync("app/styles/house-workspace-polish.css", "utf8");
const launchExperience = readFileSync(
  "app/styles/r91-launch-experience.css",
  "utf8",
);
const contact = readFileSync("app/routes/admin-contact.tsx", "utf8");

describe("AKARI workspace visual polish", () => {
  it("loads the refinement layers after the workspace styles", () => {
    expect(root).toContain('import "./styles/house-workspace-art.css"');
    expect(root).toContain('import "./styles/house-workspace-polish.css"');
    expect(root).toContain('import "./styles/r91-launch-experience.css"');
    expect(root.indexOf("house-workspace-polish.css")).toBeGreaterThan(
      root.indexOf("house-workspace-art.css"),
    );
    expect(root.indexOf("r91-launch-experience.css")).toBeGreaterThan(
      root.indexOf("house-workspace-polish.css"),
    );
  });

  it("hides the global back control beside desktop sidebars", () => {
    expect(polish).toContain("> .journey-back-button");
    expect(polish).toContain("@media (min-width: 901px)");
    expect(polish).toContain("display: none");
  });

  it("uses the approved photographic House artwork for workspace heroes", () => {
    expect(polish).toContain("/assets/optimized/arrival.webp");
    expect(polish).toContain(".admin-heading");
    expect(polish).toContain(".directory-heading");
    expect(polish).toContain("font-size: clamp(2.05rem, 2.8vw, 3.2rem)");
  });

  it("gives the contact desk grouped actions and a deliberate empty state", () => {
    expect(contact).toContain('className="workspace-hero-actions"');
    expect(contact).toContain("contact-status-tabs");
    expect(contact).toContain("contact-message-list");
    expect(contact).toContain("contact-empty-state");
    expect(contact).toContain("Queue clear");
    expect(contact).toContain("New messages matching this filter");
  });

  it("keeps directory and sidebar controls readable across breakpoints", () => {
    expect(polish).toContain(".member-directory-filters");
    expect(polish).toContain(".member-card-grid.is-list");
    expect(polish).toContain(".house-workspace-sidebar-link");
    expect(polish).toContain("@media (max-width: 680px)");
  });

  it("applies the R93 final QA layer to practical House surfaces", () => {
    expect(launchExperience).toContain("R93 — final House QA polish");
    expect(launchExperience).toContain(".project-directory-filter");
    expect(launchExperience).toContain(".project-lantern-card");
    expect(launchExperience).toContain(".event-invitation-card");
    expect(launchExperience).toContain(".campaign-directory-card");
    expect(launchExperience).toContain(".member-directory-toolbar");
    expect(launchExperience).toContain(":focus-visible");
    expect(launchExperience).toContain("outline-offset: 3px");
    expect(launchExperience).toContain("@media (max-width: 700px)");
  });
});
