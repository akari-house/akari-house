import type { Role } from "~/lib/domain";

export interface RoomDefinition {
  role: Role;
  slug: "strategy" | "creator" | "investor";
  number: string;
  audience: string;
  title: string;
  summary: string;
  detail: string;
  image: string;
  action: string;
  features: Array<{ title: string; copy: string }>;
}

export const rooms: RoomDefinition[] = [
  {
    role: "founder",
    slug: "strategy",
    number: "01",
    audience: "Founder space",
    title: "Strategy Room",
    summary:
      "Validate ideas, sharpen positioning and find the right people to move with.",
    detail:
      "Coordinate the people and evidence required to move from plan to measurable market traction.",
    image: "/assets/rooms/founder-v2.webp",
    action: "Create Your Startup Profile",
    features: [
      {
        title: "Startup profile",
        copy: "Company, team, traction and priorities.",
      },
      { title: "GTM needs", copy: "Positioning, market and launch support." },
      {
        title: "Creator discovery",
        copy: "Relevant distribution collaborators.",
      },
      {
        title: "Investor visibility",
        copy: "Control what qualified members can see.",
      },
    ],
  },
  {
    role: "creator",
    slug: "creator",
    number: "02",
    audience: "Creator space",
    title: "Creator Studio",
    summary:
      "Present your expertise, audience and the work you want to be known for.",
    detail:
      "Build a verified professional presence and discover collaborations suited to your content and market strengths.",
    image: "/assets/rooms/creator-v2.webp",
    action: "Build Your Creator Profile",
    features: [
      { title: "Creator identity", copy: "Channels, audience and portfolio." },
      { title: "Content categories", copy: "Expertise, formats and regions." },
      { title: "Campaign matches", copy: "Relevant opportunities and briefs." },
      { title: "Verification", copy: "Evidence and completed collaborations." },
    ],
  },
  {
    role: "investor",
    slug: "investor",
    number: "03",
    audience: "Investor space",
    title: "Investor Lounge",
    summary:
      "Review curated opportunities with privacy and permission built in.",
    detail:
      "Define a private investment thesis and review structured opportunities through considered introductions.",
    image: "/assets/rooms/investor-v2.webp",
    action: "Set Your Investment Preferences",
    features: [
      {
        title: "Investment thesis",
        copy: "Sector, stage, geography and cheque range.",
      },
      {
        title: "Curated matches",
        copy: "Projects aligned with your preferences.",
      },
      { title: "Watchlist", copy: "Founder updates and progress signals." },
      {
        title: "Private introductions",
        copy: "Permission-based contact and notes.",
      },
    ],
  },
];

export const workspaceData = {
  founder: {
    label: "Founder Workspace",
    person: "Haruki Tanaka · Founder",
    heading: "Shape how your venture appears inside the House.",
    stats: [
      ["Profile", "In progress"],
      ["Role", "Founder"],
      ["Visibility", "Members"],
    ],
    opportunity: [
      "Aster Protocol",
      "Infrastructure",
      "Seed",
      "Europe",
      "Creator collaboration",
      "Audience and launch-region fit",
      "12 Sep",
      "Profile verified",
    ],
  },
  creator: {
    label: "Creator Profile",
    person: "Mina Sato · Creator",
    heading: "Present your expertise with the right context.",
    stats: [
      ["Profile", "In progress"],
      ["Role", "Creator"],
      ["Visibility", "Public"],
    ],
    opportunity: [
      "Common Ground",
      "Education",
      "Growth",
      "Global",
      "Content partnership",
      "Format and sector relevance",
      "18 Sep",
      "Brief verified",
    ],
  },
  investor: {
    label: "Investor Workspace",
    person: "Noah Williams · Investor",
    heading: "Keep your investment preferences intentional and private.",
    stats: [
      ["Profile", "In progress"],
      ["Role", "Investor"],
      ["Visibility", "Private"],
    ],
    opportunity: [
      "Kitsune Labs",
      "DePIN",
      "Series A",
      "MENA",
      "Private introduction",
      "Stage, region and thesis alignment",
      "By request",
      "Founder verified",
    ],
  },
} satisfies Record<
  Role,
  {
    label: string;
    person: string;
    heading: string;
    stats: string[][];
    opportunity: string[];
  }
>;
