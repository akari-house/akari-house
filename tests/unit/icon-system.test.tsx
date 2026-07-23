// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "../../app/components/Icon";

describe("Icon", () => {
  it("is decorative and cannot receive focus", () => {
    const { container } = render(<Icon name="menu" />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
    expect(icon).toHaveClass("icon", "icon-menu");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("leaves the accessible name to its control", () => {
    render(
      <button aria-label="Open navigation" type="button">
        <Icon name="menu" />
      </button>,
    );

    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toBeInTheDocument();
  });

  it.each([
    "arrow-left",
    "arrow-right",
    "check",
    "close",
    "external",
    "menu",
    "sparkle",
  ] as const)("renders the %s icon", (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector("path")).toBeInTheDocument();
  });
});
