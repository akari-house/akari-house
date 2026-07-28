// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CommonTable } from "~/components/common-table/CommonTable";
import { MemoryRouter } from "react-router";

afterEach(cleanup);

describe("CommonTable", () => {
  it("switches role workspace content", async () => {
    render(
      <MemoryRouter>
        <CommonTable />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    expect(
      screen.getByRole("tab", { name: "Founder Workspace" }),
    ).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Investor Workspace" }));
    expect(
      screen.getByText(
        "Keep your investment preferences intentional and private.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Kitsune Labs")).toBeVisible();
  });

  it("supports arrow-key tab navigation", async () => {
    render(
      <MemoryRouter>
        <CommonTable />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    const founder = screen.getByRole("tab", { name: "Founder Workspace" });
    founder.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("tab", { name: "Creator Profile" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
