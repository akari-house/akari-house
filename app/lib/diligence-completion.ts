export const diligenceCategories = [
  "corporate",
  "legal",
  "financials",
  "product",
  "market",
  "team",
  "fundraising",
  "token_web3",
] as const;

export type DiligenceCategory = (typeof diligenceCategories)[number];

export const diligenceCategoryLabels: Record<DiligenceCategory, string> = {
  corporate: "Corporate",
  legal: "Legal",
  financials: "Financials",
  product: "Product",
  market: "Market",
  team: "Team",
  fundraising: "Fundraising",
  token_web3: "Token / Web3",
};

export const diligenceCategoryDescriptions: Record<DiligenceCategory, string> =
  {
    corporate: "Registration, ownership and corporate records.",
    legal: "Material legal, regulatory and agreement references.",
    financials:
      "Financial statements, runway, forecasts and supporting records.",
    product: "Product, architecture, security or implementation evidence.",
    market: "Market, customer, competition and commercial evidence.",
    team: "Team, key-person and organization evidence.",
    fundraising: "Deck, cap table, raise terms and use-of-funds material.",
    token_web3:
      "Tokenomics, network, treasury or onchain material where relevant.",
  };

const categoryAliases: Record<string, DiligenceCategory> = {
  company: "corporate",
  corporate: "corporate",
  legal: "legal",
  financial: "financials",
  financials: "financials",
  product: "product",
  market: "market",
  traction: "market",
  team: "team",
  fundraising: "fundraising",
  tokenomics: "token_web3",
  token_web3: "token_web3",
  risk: "legal",
};

export function normalizeDiligenceCategory(
  value: string,
): DiligenceCategory | null {
  return categoryAliases[value.trim().toLowerCase()] ?? null;
}

export function isDiligenceCategory(value: string): value is DiligenceCategory {
  return diligenceCategories.includes(value as DiligenceCategory);
}

export function diligenceCompleteness(
  categories: string[],
  tokenRelevant = false,
) {
  const present = new Set(
    categories
      .map((category) => normalizeDiligenceCategory(category))
      .filter((category): category is DiligenceCategory => Boolean(category)),
  );
  const required = diligenceCategories.filter(
    (category) => category !== "token_web3" || tokenRelevant,
  );
  const missing = required.filter((category) => !present.has(category));
  const complete = required.length - missing.length;
  return {
    required,
    missing,
    complete,
    total: required.length,
    percentage: required.length
      ? Math.round((complete / required.length) * 100)
      : 100,
  };
}
