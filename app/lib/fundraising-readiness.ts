export const fundraisingStatuses = [
  "in_preparation",
  "needs_information",
  "ready_for_outreach",
  "paused",
] as const;

export type FundraisingStatus = (typeof fundraisingStatuses)[number];

export const fundraisingStatusLabels: Record<FundraisingStatus, string> = {
  in_preparation: "In preparation",
  needs_information: "Needs information",
  ready_for_outreach: "Ready for outreach",
  paused: "Paused",
};

export type FundraisingReadinessInput = {
  projectProfileComplete: boolean;
  founderVerified: boolean;
  raiseTarget: number | null;
  raiseCurrency: string;
  fundingInstrument: string;
  tractionSummary: string;
  keyMetrics: string;
  useOfFunds: string;
  monthlyBurn: number | null;
  runwayMonths: number | null;
  capTableReady: boolean;
  pitchDeckReady: boolean;
  onePagerReady: boolean;
  financialsReady: boolean;
  corporateDocsReady: boolean;
  tokenRelevant: boolean;
  tokenomicsReady: boolean;
};

export type FundraisingReadinessItem = {
  key: string;
  label: string;
  complete: boolean;
  guidance: string;
};

export type FundraisingReadiness = {
  score: number;
  completed: number;
  total: number;
  items: FundraisingReadinessItem[];
  missing: FundraisingReadinessItem[];
  canPrepareOpportunity: boolean;
};

function hasText(value: string, minimum = 1) {
  return value.trim().length >= minimum;
}

export function calculateFundraisingReadiness(
  input: FundraisingReadinessInput,
): FundraisingReadiness {
  const items: FundraisingReadinessItem[] = [
    {
      key: "project_profile",
      label: "Project profile",
      complete: input.projectProfileComplete,
      guidance: "Complete the project summary, description, stage and public project profile.",
    },
    {
      key: "founder_verification",
      label: "Founder verification",
      complete: input.founderVerified,
      guidance: "Complete AKARI Founder verification before investor outreach.",
    },
    {
      key: "raise_details",
      label: "Raise details",
      complete:
        input.raiseTarget !== null &&
        input.raiseTarget > 0 &&
        /^[A-Z]{3}$/.test(input.raiseCurrency) &&
        input.fundingInstrument !== "other",
      guidance: "Add the raise target, currency and funding instrument.",
    },
    {
      key: "traction",
      label: "Traction and key metrics",
      complete:
        hasText(input.tractionSummary, 20) && hasText(input.keyMetrics, 10),
      guidance: "Summarize current traction and provide the most relevant measurable metrics.",
    },
    {
      key: "use_of_funds",
      label: "Use of funds",
      complete: hasText(input.useOfFunds, 20),
      guidance: "Explain how the capital will be used and what milestones it should unlock.",
    },
    {
      key: "financial_readiness",
      label: "Financial readiness",
      complete:
        input.monthlyBurn !== null &&
        input.runwayMonths !== null &&
        input.financialsReady,
      guidance: "Add monthly burn, runway and a current financials reference.",
    },
    {
      key: "cap_table",
      label: "Cap table",
      complete: input.capTableReady,
      guidance: "Add a current cap table reference for controlled diligence.",
    },
    {
      key: "pitch_deck",
      label: "Pitch deck",
      complete: input.pitchDeckReady,
      guidance: "Add the current fundraising deck reference.",
    },
    {
      key: "one_pager",
      label: "One-pager",
      complete: input.onePagerReady,
      guidance: "Add a current one-pager or concise investor overview.",
    },
    {
      key: "corporate_docs",
      label: "Corporate documents",
      complete: input.corporateDocsReady,
      guidance: "Add the core corporate or legal diligence reference.",
    },
  ];

  if (input.tokenRelevant) {
    items.push({
      key: "tokenomics",
      label: "Tokenomics",
      complete: input.tokenomicsReady,
      guidance: "Token-related raises need a current tokenomics reference.",
    });
  }

  const completed = items.filter((item) => item.complete).length;
  const total = items.length;
  const score = total ? Math.round((completed / total) * 100) : 0;
  const missing = items.filter((item) => !item.complete);

  return {
    score,
    completed,
    total,
    items,
    missing,
    canPrepareOpportunity:
      input.projectProfileComplete &&
      input.founderVerified &&
      input.raiseTarget !== null &&
      input.raiseTarget > 0 &&
      input.fundingInstrument !== "other" &&
      score >= 80,
  };
}

export function isFundraisingStatus(value: string): value is FundraisingStatus {
  return fundraisingStatuses.includes(value as FundraisingStatus);
}
