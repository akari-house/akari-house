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
  it("shows ten compact previews and the remaining public-member count", () => {
    const { container } = render(
      <HouseMemberPresence
        creators={{ totalCount: 300, members: members(10) }}
        investors={{ totalCount: 42, members: members(10) }}
      />,
    );

    expect(screen.getByText("+290")).toBeInTheDocument();
    expect(screen.getByText("+32")).toBeInTheDocument();
    expect(
      container.querySelectorAll('article[data-role="creator"] img'),
    ).toHaveLength(10);
    expect(
      screen.getByLabelText("300 approved creators with public profiles"),
    ).toBeInTheDocument();
  });

  it("never returns a negative remaining count", () => {
    expect(remainingMemberCount(6, 10)).toBe(0);
  });
});
