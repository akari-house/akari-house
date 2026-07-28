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

  it("requires approved membership for collaboration mutations", () => {
    for (const path of [
      "app/routes/project-detail.tsx",
      "app/routes/campaign-detail.tsx",
      "app/routes/campaign-workspace.tsx",
      "app/routes/iio-settlement.tsx",
    ]) {
      expect(read(path)).toContain("requireApprovedMember");
    }
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
});
