import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("final product audit safeguards", () => {
  it("keeps event media private until publication or authorized review", () => {
    const media = read("app/routes/event-media.ts");
    const migration = read("migrations/0105_event_images.sql");
    const routes = read("app/routes.ts");

    expect(migration).toContain("ADD COLUMN image_key TEXT");
    expect(routes).toContain(
      'route("media/events/:slug", "routes/event-media.ts")',
    );
    expect(media).toContain('event.status === "published"');
    expect(media).toContain("user?.id !== event.hostUserId");
    expect(media).toContain("canReview");
    expect(media).toContain('"cache-control"');
  });

  it("supports event image upload, replacement and removal", () => {
    const createEvent = read("app/routes/event-new.tsx");
    const editEvent = read("app/routes/event-edit.tsx");

    for (const source of [createEvent, editEvent]) {
      expect(source).toContain('encType="multipart/form-data"');
      expect(source).toContain('accept="image/jpeg,image/png,image/webp"');
      expect(source).toContain("validateProfilePhoto");
      expect(source).toContain("event-images/");
    }
    expect(editEvent).toContain('name="removeImage"');
    expect(editEvent).toContain("cannot be lower than the");
  });

  it("rechecks event lifecycle permissions on every mutation", () => {
    const detail = read("app/routes/event-detail.tsx");
    const edit = read("app/routes/event-edit.tsx");

    expect(edit).toContain("canHostEvents");
    expect(edit).toContain("UPDATE event_registrations");
    expect(edit).toContain("event.cancelled");
    expect(detail).toContain("Hosts cannot register for their own event");
    expect(detail).toContain("this event has ended");
  });

  it("allows applicant-safe participation while preserving privileged gates", () => {
    expect(read("app/routes/project-detail.tsx")).toContain("requireUser");
    expect(read("app/routes/campaign-detail.tsx")).toContain("requireUser");
    expect(read("app/routes/campaign-workspace.tsx")).toContain("requireUser");
    expect(read("app/routes/event-detail.tsx")).toContain("event_interests");
    expect(read("app/routes/project-detail.tsx")).toContain(
      "isVerifiedInvestor",
    );
    expect(read("app/routes/iio-settlement.tsx")).toContain(
      "requireApprovedMember",
    );
  });

  it("keeps linked project teammates within public profile boundaries", () => {
    const detail = read("app/routes/project-detail.tsx");
    const edit = read("app/routes/project-edit.tsx");

    for (const source of [detail, edit]) {
      expect(source).toContain("membership_applications");
      expect(source).toContain("profile_visibility");
      expect(source).toContain("'public'");
    }
  });

  it("keeps Superadmin tools available on compact dashboards", () => {
    const dashboard = read("app/routes/dashboard.tsx");
    expect(dashboard).toContain("dashboard-mobile-tools");
    expect(dashboard).toContain("/admin/house-directory");
    expect(dashboard).toContain("/admin/team");
  });

  it("supports keyboard room navigation and prevents duplicate introductions", () => {
    const hall = read("app/components/house/HouseHall.tsx");
    const deal = read("app/routes/deal-room.tsx");

    expect(hall).toContain('event.key === "ArrowRight"');
    expect(hall).toContain('"ArrowRight", "ArrowLeft", "Home", "End"');
    expect(hall).toContain("tabIndex={activeRoom === room.role ? 0 : -1}");
    expect(deal).toContain(
      "Your Founder introduction request is already pending.",
    );
    expect(deal).toContain("Introduction approved");
  });

  it("resolves production smoke access by internal Superadmin role", () => {
    const workflow = read(".github/workflows/deploy-production.yml");
    expect(workflow).not.toContain("OWNER_EMAIL");
    expect(workflow).toContain("au.access_level = 'superadmin'");
    expect(workflow).toContain("SELECT u.id FROM users u");
  });

  it("keeps the Team page visual and portrait system production-safe", () => {
    const team = read("app/routes/team.tsx");
    const directory = read("app/components/HouseDirectory.tsx");
    const directoryData = read("app/lib/house-directory.server.ts");
    const styles = read("app/styles/site-final-polish.css");

    expect(team).toContain("/assets/team/keepers-hero.svg");
    expect(team).toContain("/assets/team/keepers-hero-mobile.svg");
    expect(team).toContain("people-house-hero__art");
    expect(team).toContain("chapterNumber");
    expect(directory).toContain("people-card__image");
    expect(directory).toContain("houseDirectoryImageUrl(entry)");
    expect(directoryData).toContain("updated_at AS imageVersion");
    expect(styles).toContain("width: 100%;");
    expect(styles).toContain("max-height: none;");
    expect(styles).toContain('url("/assets/team/wider-house.svg")');
    expect(styles).toContain("@media (max-width: 390px)");
  });
});
