// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { RoleSelector } from "~/components/RoleSelector";

afterEach(cleanup);

describe("authenticated form controls", () => {
  it("keeps role selection keyboard-operable and grouped", async () => {
    const user = userEvent.setup();
    render(<RoleSelector selected={["creator"]} />);

    expect(
      screen.getByRole("group", { name: "Select one or more roles" }),
    ).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Creator/ })).toBeChecked();

    const founder = screen.getByRole("checkbox", { name: /Founder/ });
    founder.focus();
    await user.keyboard(" ");
    expect(founder).toBeChecked();
  });

  it("defines consistent select, focus and touch-size safeguards", () => {
    const css = readFileSync("app/styles/app.css", "utf8");

    expect(css).toContain("/* Authenticated form controls */");
    expect(css).toMatch(/select\s*\{[\s\S]*?appearance:\s*none;/);
    expect(css).toMatch(/select\s*\{[\s\S]*?background-image:\s*url\(/);
    expect(css).toMatch(/min-height:\s*48px;/);
    expect(css).toMatch(/select:focus-visible\s*\{/);
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?font-size:\s*16px;/,
    );
  });
});
