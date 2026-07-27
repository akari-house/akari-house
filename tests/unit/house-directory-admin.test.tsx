// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { HouseDirectoryAdminForm } from "~/components/HouseDirectoryAdminForm";
import { isHouseDirectoryOrganization } from "~/lib/house-directory";

afterEach(cleanup);

function renderForm() {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: "*", element: <HouseDirectoryAdminForm /> }],
        { initialEntries: ["/admin/house-directory"] },
      )}
    />,
  );
}

describe("house directory organization form", () => {
  it("uses the detailed profile fields for people", () => {
    renderForm();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Title or relationship")).toBeInTheDocument();
    expect(screen.getByLabelText("Short biography")).toBeInTheDocument();
    expect(screen.getByLabelText("Website")).toBeInTheDocument();
    expect(screen.getByLabelText("Photo")).toBeInTheDocument();
  });

  it("shows only organization fields for partners and providers", async () => {
    renderForm();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Category"), "provider");

    expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
    expect(screen.getByLabelText("Logo")).toBeInTheDocument();
    expect(screen.getByLabelText("Display order")).toBeInTheDocument();
    expect(screen.getByLabelText("Publication")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Organization entries are intentionally simple: logo and name only.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Title or relationship"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Short biography")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Website")).not.toBeInTheDocument();
  });

  it("classifies only partner categories as organizations", () => {
    expect(isHouseDirectoryOrganization("partner")).toBe(true);
    expect(isHouseDirectoryOrganization("provider")).toBe(true);
    expect(isHouseDirectoryOrganization("team")).toBe(false);
    expect(isHouseDirectoryOrganization("advisor")).toBe(false);
    expect(isHouseDirectoryOrganization("supporter")).toBe(false);
  });
});
