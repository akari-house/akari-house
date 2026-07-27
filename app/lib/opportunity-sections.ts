export const opportunitySectionDefinitions = [
  {
    key: "problem_solution",
    title: "Problem and solution",
    description:
      "The problem, the proposed solution and why the approach matters.",
  },
  {
    key: "product_demo",
    title: "Product and demo",
    description:
      "Product maturity, current experience and an approved demo context.",
  },
  {
    key: "market_competition",
    title: "Market and competition",
    description:
      "Target market, alternatives, positioning and competitive risks.",
  },
  {
    key: "business_model",
    title: "Business model",
    description:
      "Revenue model, customers, pricing and commercial assumptions.",
  },
  {
    key: "traction",
    title: "Traction",
    description:
      "Evidence of adoption, revenue, pilots, retention or other progress.",
  },
  {
    key: "team",
    title: "Team",
    description:
      "Relevant team background, responsibilities and key hiring needs.",
  },
  {
    key: "raise_information",
    title: "Raise information",
    description:
      "Current raise structure, timing and material terms approved for review.",
  },
  {
    key: "use_of_funds",
    title: "Use of funds",
    description: "Planned allocation, milestones and expected runway.",
  },
  {
    key: "tokenomics",
    title: "Tokenomics",
    description:
      "Token design and distribution where relevant; otherwise leave blank.",
  },
  {
    key: "risk_information",
    title: "Risk information",
    description:
      "Material technical, commercial, regulatory and execution risks.",
  },
] as const;

export type OpportunitySectionKey =
  (typeof opportunitySectionDefinitions)[number]["key"];
