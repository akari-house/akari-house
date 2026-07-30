export const campaignPlatforms = [
  "x",
  "youtube",
  "tiktok",
  "instagram",
] as const;

export type CampaignPlatform = (typeof campaignPlatforms)[number];

export type CampaignCandidate = {
  id: string;
  selectedPlatforms: CampaignPlatform[];
  followers: Record<CampaignPlatform, number>;
  xScore: number;
  sorsaScore: number;
  postingDays: number[];
  engagementAccepted: boolean;
};

export type CampaignPlatformWeights = Record<CampaignPlatform, number>;

export type CampaignAllocation = CampaignCandidate & {
  platformScore: number;
  postingCommitmentScore: number;
  engagementCommitmentScore: number;
  selectionScore: number;
  payoutCents: number;
  payoutPercent: number;
};

function percentile(values: number[], value: number) {
  if (values.length <= 1) return 1;
  const below = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return (below + (equal - 1) / 2) / (values.length - 1);
}

function requiredPostingDays(postingCadence: string) {
  if (postingCadence === "daily_posting") return 7;
  if (postingCadence.startsWith("weekly_")) {
    const count = Number(postingCadence.slice("weekly_".length));
    return Number.isInteger(count) && count > 0 ? count : 1;
  }
  return 1;
}

export function parseCampaignPlatforms(value: string | null | undefined) {
  if (!value) return ["x"] satisfies CampaignPlatform[];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return ["x"] satisfies CampaignPlatform[];
    const selected = campaignPlatforms.filter((platform) =>
      parsed.includes(platform),
    );
    return selected.length ? selected : (["x"] satisfies CampaignPlatform[]);
  } catch {
    return ["x"] satisfies CampaignPlatform[];
  }
}

export function parsePlatformWeights(value: string | null | undefined) {
  const fallback: CampaignPlatformWeights = {
    x: 100,
    youtube: 0,
    tiktok: 0,
    instagram: 0,
  };
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<CampaignPlatformWeights>;
    const weights = Object.fromEntries(
      campaignPlatforms.map((platform) => {
        const number = Number(parsed[platform] ?? 0);
        return [platform, Number.isFinite(number) && number >= 0 ? number : 0];
      }),
    ) as CampaignPlatformWeights;
    return campaignPlatforms.reduce((sum, platform) => sum + weights[platform], 0)
      ? weights
      : fallback;
  } catch {
    return fallback;
  }
}

export function validatePlatformWeights(weights: CampaignPlatformWeights) {
  return (
    campaignPlatforms.every(
      (platform) =>
        Number.isInteger(weights[platform]) &&
        weights[platform] >= 0 &&
        weights[platform] <= 100,
    ) &&
    campaignPlatforms.reduce((sum, platform) => sum + weights[platform], 0) ===
      100
  );
}

export function allocateCampaignBudget(
  candidates: CampaignCandidate[],
  config: {
    budgetCents: number;
    bonusPoolCents: number;
    maximumAllocationCents: number;
    platformWeights: CampaignPlatformWeights;
    postingCadence: string;
    dailyEngagementRequired: boolean;
  },
): CampaignAllocation[] {
  if (!candidates.length) return [];
  if (
    !Number.isInteger(config.budgetCents) ||
    !Number.isInteger(config.bonusPoolCents) ||
    !Number.isInteger(config.maximumAllocationCents) ||
    config.budgetCents < 0 ||
    config.bonusPoolCents < 0 ||
    config.bonusPoolCents > config.budgetCents ||
    config.maximumAllocationCents <= 0
  )
    throw new Error("Campaign compensation configuration is invalid.");
  if (!validatePlatformWeights(config.platformWeights))
    throw new Error("Campaign platform weights must total 100.");

  const platformFollowerValues = Object.fromEntries(
    campaignPlatforms.map((platform) => [
      platform,
      candidates
        .filter((candidate) => candidate.selectedPlatforms.includes(platform))
        .map((candidate) => Math.max(0, candidate.followers[platform] ?? 0)),
    ]),
  ) as Record<CampaignPlatform, number[]>;
  const xCandidates = candidates.filter((candidate) =>
    candidate.selectedPlatforms.includes("x"),
  );
  const xScoreValues = xCandidates.map((candidate) => Math.max(0, candidate.xScore));
  const sorsaValues = xCandidates.map((candidate) =>
    Math.max(0, candidate.sorsaScore),
  );
  const minimumDays = requiredPostingDays(config.postingCadence);

  const scored = candidates.map((candidate) => {
    const platformScores = candidate.selectedPlatforms.map((platform) => {
      const followerScore = percentile(
        platformFollowerValues[platform],
        Math.max(0, candidate.followers[platform] ?? 0),
      );
      const score =
        platform === "x"
          ? followerScore * 0.4 +
            percentile(xScoreValues, Math.max(0, candidate.xScore)) * 0.3 +
            percentile(sorsaValues, Math.max(0, candidate.sorsaScore)) * 0.3
          : followerScore;
      return {
        platform,
        score,
        weight: config.platformWeights[platform],
      };
    });
    const selectedWeight = platformScores.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    const platformScore = selectedWeight
      ? platformScores.reduce(
          (sum, item) => sum + item.score * item.weight,
          0,
        ) / selectedWeight
      : platformScores.reduce((sum, item) => sum + item.score, 0) /
        Math.max(1, platformScores.length);
    const uniquePostingDays = new Set(
      candidate.postingDays.filter(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6,
      ),
    ).size;
    const postingCommitmentScore = Math.min(1, uniquePostingDays / minimumDays);
    const engagementCommitmentScore = config.dailyEngagementRequired
      ? candidate.engagementAccepted
        ? 1
        : 0
      : 1;
    const selectionScore =
      platformScore * 0.7 +
      postingCommitmentScore * 0.2 +
      engagementCommitmentScore * 0.1;
    return {
      ...candidate,
      platformScore,
      postingCommitmentScore,
      engagementCommitmentScore,
      selectionScore,
    };
  });

  const highestScore = Math.max(...scored.map((candidate) => candidate.selectionScore));
  const baseBudgetCents = Math.max(0, config.budgetCents - config.bonusPoolCents);
  const provisional = scored.map((candidate) => {
    const exact = highestScore
      ? (config.maximumAllocationCents * candidate.selectionScore) / highestScore
      : 0;
    return { ...candidate, exact: Math.min(config.maximumAllocationCents, exact) };
  });
  const provisionalTotal = provisional.reduce((sum, item) => sum + item.exact, 0);
  const budgetFactor = provisionalTotal
    ? Math.min(1, baseBudgetCents / provisionalTotal)
    : 0;

  return provisional.map(({ exact, ...candidate }) => {
    const payoutCents = Math.min(
      config.maximumAllocationCents,
      Math.floor(exact * budgetFactor),
    );
    return {
      ...candidate,
      payoutCents,
      payoutPercent:
        baseBudgetCents === 0 ? 0 : (payoutCents / baseBudgetCents) * 100,
    };
  });
}
