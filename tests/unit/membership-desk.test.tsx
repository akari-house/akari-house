// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { MembershipDesk } from "~/components/membership/MembershipDesk";

afterEach(cleanup);

function renderDesk() {
  const router = createMemoryRouter([
    { path: "/", element: <MembershipDesk /> },
    { path: "/register", element: <p>Register</p> },
  ]);
  return render(<RouterProvider router={router} />);
}

describe("MembershipDesk", () => {
  it("starts with no role selected and enables membership after selection", async () => {
    renderDesk();
    const user = userEvent.setup();
    const founder = screen.getByRole("checkbox", { name: /Founder/ });
    const creator = screen.getByRole("checkbox", { name: /Creator/ });
    const continueLink = screen.getByRole("link", {
      name: /Continue to membership/,
    });
    expect(founder).not.toBeChecked();
    expect(creator).not.toBeChecked();
    expect(continueLink).toHaveAttribute("aria-disabled", "true");
    await user.click(founder);
    await user.click(creator);
    expect(screen.getByText("2 roles selected")).toBeVisible();
    expect(continueLink).toHaveAttribute(
      "href",
      "/register?role=founder&role=creator",
    );
  });
});
