// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { HouseHall } from "~/components/house/HouseHall";
import { SiteHeader } from "~/components/SiteHeader";

afterEach(cleanup);

function withRouter(element: React.ReactNode) {
  return render(
    <RouterProvider router={createMemoryRouter([{ path: "*", element }])} />,
  );
}

describe("house interactions", () => {
  it("opens a room, traps focus, closes with Escape and restores focus", async () => {
    const user = userEvent.setup();
    withRouter(<HouseHall />);
    const trigger = screen.getByRole("button", { name: /Enter Strategy Room/ });
    await user.click(trigger);
    const close = screen.getByRole("button", {
      name: "Close Strategy Room and return to the Hall",
    });
    expect(screen.getByRole("dialog", { name: "Strategy Room" })).toBeVisible();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("locks body scroll while mobile navigation is open", async () => {
    const user = userEvent.setup();
    withRouter(<SiteHeader user={null} />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveFocus();
  });
});
