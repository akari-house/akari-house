export type SignalSource =
  "official_api" | "partner_verified" | "member_reported" | "unavailable";

export type MemberSignals = {
  sorsaScore: number | null;
  xScore: number | null;
  following: number | null;
  sorsaSource: SignalSource;
  xScoreSource: SignalSource;
  followingSource: SignalSource;
};

const weights = { sorsaScore: 0.4, xScore: 0.35, following: 0.25 } as const;

export function confidenceFor(source: SignalSource) {
  if (source === "official_api" || source === "partner_verified") return 1;
  if (source === "member_reported") return 0.35;
  return 0;
}

function rank(value: number | null, population: Array<number | null>) {
  if (value === null || !Number.isFinite(value)) return null;
  const valid = population.filter(
    (item): item is number => item !== null && Number.isFinite(item),
  );
  if (valid.length < 3) return null;
  const below = valid.filter((item) => item < value).length;
  const equal = valid.filter((item) => item === value).length;
  return (below + Math.max(0, equal - 1) / 2) / Math.max(1, valid.length - 1);
}

export function calculateAkariPercentile(
  member: MemberSignals,
  population: MemberSignals[],
) {
  const inputs = [
    {
      key: "sorsaScore" as const,
      rank: rank(
        member.sorsaScore,
        population.map((item) => item.sorsaScore),
      ),
      confidence: confidenceFor(member.sorsaSource),
    },
    {
      key: "xScore" as const,
      rank: rank(
        member.xScore,
        population.map((item) => item.xScore),
      ),
      confidence: confidenceFor(member.xScoreSource),
    },
    {
      key: "following" as const,
      rank: rank(
        member.following,
        population.map((item) => item.following),
      ),
      confidence: confidenceFor(member.followingSource),
    },
  ].filter((item) => item.rank !== null && item.confidence > 0);

  const denominator = inputs.reduce(
    (sum, item) => sum + weights[item.key] * item.confidence,
    0,
  );
  if (denominator === 0) {
    return { topPercent: null, confidence: "insufficient" as const };
  }

  const score =
    inputs.reduce(
      (sum, item) =>
        sum + (item.rank ?? 0) * weights[item.key] * item.confidence,
      0,
    ) / denominator;
  const verifiedWeight = inputs.reduce(
    (sum, item) => sum + weights[item.key] * (item.confidence === 1 ? 1 : 0),
    0,
  );

  return {
    topPercent: Math.max(1, Math.min(99, Math.round((1 - score) * 100))),
    confidence:
      verifiedWeight >= 0.6 ? ("verified" as const) : ("provisional" as const),
  };
}
