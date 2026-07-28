// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { PeopleCard } from "~/components/HouseDirectory";
import type { HouseDirectoryEntry } from "~/lib/house-directory";

afterEach(cleanup);

const entry: HouseDirectoryEntry = {
  id: "keeper-1",
  category: "team",
  name: "Mina Sato",
  title: "House Keeper",
  biography:
    "Mina keeps the House moving by connecting the right people, preserving context and making sure every collaboration has a clear next step.",
  imageKey: "house-directory/keeper-1/image.webp",
  websiteUrl: null,
  xUrl: "https://x.com/mina",
  linkedinUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
  youtubeUrl: null,
  telegramUrl: null,
  displayOrder: 1,
  status: "published",
  imageVersion: "2026-07-28 10:45:12",
};

function renderCard() {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: "*", element: <PeopleCard entry={entry} /> }],
        { initialEntries: ["/team"] },
      )}
    />,
  );
}

describe("AKARI people card", () => {
  it("uses a square, versioned portrait source", () => {
    const { container } = renderCard();
    const image = container.querySelector(".people-card__image");

    expect(image).toHaveAttribute(
      "src",
      "/media/house-directory/keeper-1?v=2026-07-28%2010%3A45%3A12",
    );
    expect(image).toHaveAttribute("width", "640");
    expect(image).toHaveAttribute("height", "640");
  });

  it("expands and collapses a long biography accessibly", async () => {
    renderCard();
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: "Read more" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
