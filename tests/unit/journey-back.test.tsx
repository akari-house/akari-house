// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { JourneyBack } from "~/components/JourneyBack";

afterEach(cleanup);

function renderAt(pathname: string) {
  return render(
    <RouterProvider
      router={createMemoryRouter([{ path: "*", element: <JourneyBack /> }], {
        initialEntries: [pathname],
      })}
    />,
  );
}

describe("JourneyBack", () => {
  it.each([
    ["/projects/lantern", "Back to projects", "/projects"],
    ["/events/gathering", "Back to events", "/events"],
    ["/profiles/akari", "Back to members", "/members"],
    ["/archive/field-note", "Back to the Archive", "/archive"],
    ["/rooms/creator", "Back to the House", "/"],
    ["/notifications", "Back to your House", "/app"],
  ])("maps %s to its deterministic parent", (pathname, label, href) => {
    renderAt(pathname);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      href,
    );
  });

  it("does not render on the House homepage", () => {
    renderAt("/");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
