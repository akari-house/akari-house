// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  HouseMemberPresence,
  remainingMemberCount,
  type HouseMemberPreview,
} from "~/components/HouseMemberPresence";

afterEach(cleanup);

function members(count: number): HouseMemberPreview[] {
  return Array.from({ length: count }, (_, index) => ({
    username: `member-${index + 1}`,
    displayName: `Member ${index + 1}`,
    hasAvatar: true,
  }));
}

describe("homepage member presence", () => {
  it("shows approved totals while previewing public profiles only", () => {
    const { container } = render(
      <HouseMemberPresence
        creators={{ totalCount: 300, publicCount: 12, members: members(10) }}
        investors={{ totalCount: 42, publicCount: 10, members: members(10) }}
      />,
    );

    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("+290")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('article[data-role="creator"] img'),
    ).toHaveLength(10);
    expect(
      screen.getByLabelText("300 approved creators; 12 public profiles"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Counts include every approved member. Portraits appear only for members with public profiles.",
      ),
    ).toBeInTheDocument();
  });

  it("never returns a negative remaining count", () => {
    expect(remainingMemberCount(6, 10)).toBe(0);
  });
});
