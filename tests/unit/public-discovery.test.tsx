// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { EventInvitationCard } from "~/components/discovery/EventInvitationCard";
import { HouseInMotion } from "~/components/discovery/HouseInMotion";
import { ProjectLanternCard } from "~/components/discovery/ProjectLanternCard";
import { PublicFooter } from "~/components/PublicFooter";
import { caseStudies } from "~/data/case-studies";

afterEach(cleanup);

function renderWithRouter(element: React.ReactNode) {
  return render(
    <RouterProvider
      router={createMemoryRouter([{ path: "*", element }], {
        initialEntries: ["/"],
      })}
    />,
  );
}

const project = {
  slug: "paper-lantern",
  title: "Paper Lantern",
  summary: "A trusted collaboration space for independent teams.",
  stage: "seed",
  seeking: "A thoughtful creator partner",
  founderName: "Mina Sato",
  founderUsername: "mina",
  followerCount: 12,
};

const event = {
  slug: "summer-table",
  title: "Summer Common Table",
  summary: "A considered conversation for founders and creators.",
  format: "online",
  venue: "",
  startsAt: "2026-08-12T17:00:00.000Z",
  timezone: "Europe/Berlin",
  capacity: 24,
  hostName: "Haruki Tanaka",
  registeredCount: 8,
};

describe("public discovery surfaces", () => {
  it("presents projects as approved lantern records", () => {
    renderWithRouter(<ProjectLanternCard project={project} />);
    expect(screen.getByRole("link", { name: "Paper Lantern" })).toHaveAttribute(
      "href",
      "/projects/paper-lantern",
    );
    expect(screen.getByText("Approved project")).toBeVisible();
    expect(screen.getByText("A thoughtful creator partner")).toBeVisible();
  });

  it("makes date and capacity the event invitation hierarchy", () => {
    renderWithRouter(<EventInvitationCard event={event} />);
    expect(
      screen.getByRole("link", { name: "Summer Common Table" }),
    ).toHaveAttribute("href", "/events/summer-table");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "8",
    );
    expect(screen.getByText("Aug")).toBeVisible();
  });

  it("bridges live work and evidence from the homepage", () => {
    renderWithRouter(
      <HouseInMotion
        project={project}
        event={event}
        caseStudy={caseStudies[0]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Explore projects" }),
    ).toHaveAttribute("href", "/projects");
    expect(
      screen.getByRole("link", { name: "Open the calendar" }),
    ).toHaveAttribute("href", "/events");
    expect(screen.getByText("From the Archive")).toBeVisible();
  });

  it("keeps trust and policy links available in the public footer", () => {
    renderWithRouter(<PublicFooter />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "Community guidelines" }),
    ).toHaveAttribute("href", "/community-guidelines");
  });
});
