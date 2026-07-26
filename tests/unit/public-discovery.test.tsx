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
import { AkariMotif } from "~/components/AkariMotif";

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
    const { container } = renderWithRouter(
      <EventInvitationCard event={event} />,
    );
    expect(
      screen.getByRole("link", { name: "Summer Common Table" }),
    ).toHaveAttribute("href", "/events/summer-table");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "8",
    );
    expect(screen.getByText("Aug")).toBeVisible();
    expect(container.querySelector(".event-invitation-mark")).toBeTruthy();
    expect(container.querySelector(".event-host-nameplate svg")).toBeTruthy();
  });

  it("keeps decorative motifs hidden and named motifs semantic", () => {
    const { rerender } = render(<AkariMotif motif="blossom" />);
    expect(document.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    rerender(<AkariMotif motif="invitation" label="Event invitation" />);
    expect(screen.getByRole("img", { name: "Event invitation" })).toBeVisible();
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

  it("organises working destinations and original risk information in the public footer", () => {
    const { container } = renderWithRouter(<PublicFooter />);
    for (const heading of ["Network", "Opportunities", "Resources", "Legal"])
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "href",
      "/projects",
    );
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
    expect(
      screen.getByRole("heading", { name: "Discovery is not a guarantee." }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /does not provide investment, financial, legal or tax advice/i,
      ),
    ).toBeVisible();
    expect(screen.getByText(/subject to final legal review/i)).toBeVisible();

    const landscape = container.querySelector("[data-footer-landscape]");
    expect(landscape).toHaveAttribute("aria-hidden", "true");
    const panorama = landscape?.querySelector("img");
    expect(panorama).toHaveAttribute(
      "src",
      "/assets/footer/akari-footer-panorama.svg",
    );
    expect(panorama).toHaveAttribute("alt", "");
  });
});
