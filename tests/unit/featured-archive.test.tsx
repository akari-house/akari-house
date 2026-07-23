// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturedArchiveCarousel } from "~/components/archive/FeaturedArchiveCarousel";

afterEach(cleanup);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

function renderCarousel() {
  return render(
    <RouterProvider
      router={createMemoryRouter([
        { path: "*", element: <FeaturedArchiveCarousel /> },
      ])}
    />,
  );
}

describe("featured Archive carousel", () => {
  it("shows all authorized records with direct detail links", () => {
    renderCarousel();
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(
      screen.getAllByRole("link", { name: "Open the record" })[0],
    ).toHaveAttribute("href", "/archive/gameon-forge");
  });

  it("moves through records with visible controls", async () => {
    const user = userEvent.setup();
    renderCarousel();
    await user.click(screen.getByRole("button", { name: "Next case study" }));
    expect(screen.getByText("02")).toBeVisible();
    expect(
      screen.getByText("AlphaBlockZ Ecosystem", {
        selector: ".archive-shelf-heading p",
      }),
    ).toBeVisible();
  });
});
