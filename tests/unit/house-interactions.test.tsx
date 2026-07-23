// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { HouseHall } from "~/components/house/HouseHall";
import { BlossomJourney } from "~/components/house/BlossomJourney";
import { SiteHeader } from "~/components/SiteHeader";

afterEach(cleanup);

function withRouter(element: React.ReactNode, initialEntry = "/") {
  return render(
    <RouterProvider
      router={createMemoryRouter([{ path: "*", element }], {
        initialEntries: [initialEntry],
      })}
    />,
  );
}

describe("house interactions", () => {
  it("moves the Blossom Journey through accessible outcomes", async () => {
    const user = userEvent.setup();
    withRouter(<BlossomJourney />);
    const entrance = screen.getByRole("tab", { name: /Entrance/ });
    entrance.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Strategy Room/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/Turn a broad ambition/)).toBeVisible();
  });

  it("previews rooms before exposing one dedicated entry link", async () => {
    const user = userEvent.setup();
    withRouter(<HouseHall />);
    expect(screen.getByRole("link", { name: /Enter room/ })).toHaveAttribute(
      "href",
      "/rooms/strategy",
    );
    await user.click(
      screen.getByRole("button", { name: "Preview Creator Studio" }),
    );
    expect(screen.getByRole("link", { name: /Enter room/ })).toHaveAttribute(
      "href",
      "/rooms/creator",
    );
  });

  it("moves the Hall focus toward the room being explored", async () => {
    const user = userEvent.setup();
    const { container } = withRouter(<HouseHall />);
    await user.click(
      screen.getByRole("button", { name: "Preview Creator Studio" }),
    );
    expect(container.querySelector(".hall-stage")).toHaveAttribute(
      "data-active-room",
      "creator",
    );
  });

  it("locks body scroll while mobile navigation is open", async () => {
    const user = userEvent.setup();
    withRouter(<SiteHeader user={null} />);
    const menu = screen.getByRole("button", { name: "Open navigation" });
    await waitFor(() => expect(menu).toBeEnabled());
    await user.click(menu);
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveFocus();
  });

  it("exposes authenticated destinations in mobile navigation", async () => {
    const user = userEvent.setup();
    withRouter(
      <SiteHeader
        user={{
          id: "member-1",
          email: "member@example.test",
          username: "member",
          displayName: "AKARI Member",
          accessTier: "member",
          roles: ["founder"],
        }}
      />,
      "/connections",
    );
    const menu = screen.getByRole("button", { name: "Open navigation" });
    await waitFor(() => expect(menu).toBeEnabled());
    await user.click(menu);
    expect(
      screen.getByRole("navigation", { name: "Your AKARI account" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "My projects" })).toHaveAttribute(
      "href",
      "/projects/manage",
    );
    expect(screen.getByRole("link", { name: "Connections" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute(
      "href",
      "/settings/telegram",
    );
  });
});
