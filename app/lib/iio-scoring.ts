export type IioCandidate = {
  id: string;
  xFollowers: number;
  xScore: number;
  sorsaScore: number;
};

export type IioWeights = {
  followers: number;
  xScore: number;
  sorsaScore: number;
};

export type IioDistribution = IioCandidate & {
  followerPercentile: number;
  xScorePercentile: number;
  sorsaPercentile: number;
  akariScore: number;
  payoutPercent: number;
  payoutCents: number;
};

function percentile(values: number[], value: number) {
  if (values.length <= 1) return 1;
  const below = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return (below + (equal - 1) / 2) / (values.length - 1);
}

export function validateIioWeights(weights: IioWeights) {
  return (
    weights.followers >= 0 &&
    weights.xScore >= 0 &&
    weights.sorsaScore >= 0 &&
    weights.followers + weights.xScore + weights.sorsaScore === 100
  );
}

export function distributeIioBudget(
  candidates: IioCandidate[],
  budgetCents: number,
  weights: IioWeights,
): IioDistribution[] {
  if (!validateIioWeights(weights))
    throw new Error("IIO weights must total 100.");
  if (!Number.isInteger(budgetCents) || budgetCents < 0)
    throw new Error("IIO budget must be a non-negative number of cents.");
  if (!candidates.length) return [];

  const followerValues = candidates.map((item) => item.xFollowers);
  const xScoreValues = candidates.map((item) => item.xScore);
  const sorsaValues = candidates.map((item) => item.sorsaScore);
  const weighted = candidates.map((candidate) => {
    const followerPercentile = percentile(followerValues, candidate.xFollowers);
    const xScorePercentile = percentile(xScoreValues, candidate.xScore);
    const sorsaPercentile = percentile(sorsaValues, candidate.sorsaScore);
    const akariScore =
      (followerPercentile * weights.followers +
        xScorePercentile * weights.xScore +
        sorsaPercentile * weights.sorsaScore) /
      100;
    return {
      ...candidate,
      followerPercentile,
      xScorePercentile,
      sorsaPercentile,
      akariScore,
    };
  });

  // A small floor prevents a selected Creator receiving a zero allocation.
  const scoreTotal = weighted.reduce(
    (sum, item) => sum + Math.max(item.akariScore, 0.05),
    0,
  );
  const shares = weighted.map((item) => {
    const exact = (budgetCents * Math.max(item.akariScore, 0.05)) / scoreTotal;
    return { ...item, exact, payoutCents: Math.floor(exact) };
  });
  const remainder =
    budgetCents - shares.reduce((sum, item) => sum + item.payoutCents, 0);
  const remainderOrder = [...shares].sort(
    (left, right) =>
      right.exact -
        Math.floor(right.exact) -
        (left.exact - Math.floor(left.exact)) ||
      left.id.localeCompare(right.id),
  );
  for (let index = 0; index < remainder; index += 1)
    remainderOrder[index % remainderOrder.length].payoutCents += 1;

  return shares.map((item) => ({
    id: item.id,
    xFollowers: item.xFollowers,
    xScore: item.xScore,
    sorsaScore: item.sorsaScore,
    followerPercentile: item.followerPercentile,
    xScorePercentile: item.xScorePercentile,
    sorsaPercentile: item.sorsaPercentile,
    akariScore: item.akariScore,
    payoutCents: item.payoutCents,
    payoutPercent:
      budgetCents === 0 ? 0 : (item.payoutCents / budgetCents) * 100,
  }));
}
