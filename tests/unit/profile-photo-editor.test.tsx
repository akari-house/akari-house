// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ProfilePhotoEditor } from "~/components/ProfilePhotoEditor";

afterEach(cleanup);

function renderEditor(avatarKey = "") {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: "*",
            element: (
              <ProfilePhotoEditor
                avatarKey={avatarKey}
                displayName="Akari Member"
                isMember
                username="akari"
              />
            ),
            action: () => null,
          },
        ],
        { initialEntries: ["/app"] },
      )}
    />,
  );
}

describe("ProfilePhotoEditor", () => {
  it("announces the selected filename before enabling upload", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    const upload = screen.getByRole("button", { name: "Upload photo" });
    expect(upload).toBeDisabled();

    const image = new File(["image"], "portrait.webp", {
      type: "image/webp",
    });
    await user.upload(screen.getByLabelText("Choose image"), image);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Selected: portrait.webp",
    );
    expect(upload).toBeEnabled();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector("[name=displayName]")).toBeNull();
  });

  it("uses an explicit accessible name for photo removal", () => {
    renderEditor("profile-photos/member/photo.webp");
    expect(
      screen.getByRole("button", { name: "Remove profile photo" }),
    ).toBeEnabled();
  });
});
