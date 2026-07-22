// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("links each destination to a dedicated room route", () => {
    withRouter(<HouseHall />);
    expect(screen.getByRole("link", { name: /Strategy Room/ })).toHaveAttribute(
      "href",
      "/rooms/strategy",
    );
    expect(
      screen.getByRole("link", { name: /Creator Studio/ }),
    ).toHaveAttribute("href", "/rooms/creator");
    expect(
      screen.getByRole("link", { name: /Investor Lounge/ }),
    ).toHaveAttribute("href", "/rooms/investor");
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
