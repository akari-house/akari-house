import type { InvestorProfileStatus } from "./opportunity-access.server";

export type InvestorPreferenceProfile = {
  status: InvestorProfileStatus;
  sectors: string[];
  stages: string[];
  geographies: string[];
  minimumTicket: number | null;
  maximumTicket: number | null;
  ticketCurrency: string;
  eligibilityNote: string;
  updatedAt: string;
  complete: boolean;
};

export type MatchableOpportunity = {
  sector: string;
  stage: string;
  geography: string;
  minimumParticipation: number | null;
  raiseCurrency: string;
};

export type OpportunityProfileMatch = {
  score: number | null;
  reasons: string[];
};

type InvestorPreferenceRow = {
  status: InvestorProfileStatus;
  sectorsJson: string;
  stagesJson: string;
  geographiesJson: string;
  minimumTicket: number | null;
  maximumTicket: number | null;
  ticketCurrency: string;
  eligibilityNote: string;
  updatedAt: string;
};

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

function normalise(value: string) {
  return value.trim().toLocaleLowerCase("en-GB").replaceAll("_", " ");
}

function includesPreference(preferences: string[], value: string) {
  const target = normalise(value);
  if (!target) return false;
  return preferences.some((preference) => {
    const candidate = normalise(preference);
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });
}

export async function loadInvestorPreferenceProfile(
  db: D1Database,
  userId: string,
): Promise<InvestorPreferenceProfile | null> {
  const row = await db
    .prepare(
      `SELECT status, sectors_json AS sectorsJson, stages_json AS stagesJson,
              geographies_json AS geographiesJson,
              minimum_ticket AS minimumTicket,
              maximum_ticket AS maximumTicket,
              ticket_currency AS ticketCurrency,
              eligibility_note AS eligibilityNote,
              updated_at AS updatedAt
       FROM investor_profiles
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<InvestorPreferenceRow>();
  if (!row) return null;

  const sectors = parseList(row.sectorsJson);
  const stages = parseList(row.stagesJson);
  const geographies = parseList(row.geographiesJson);
  const ticketCurrency = row.ticketCurrency.trim().toUpperCase();
  const eligibilityNote = row.eligibilityNote.trim();

  return {
    status: row.status,
    sectors,
    stages,
    geographies,
    minimumTicket: row.minimumTicket,
    maximumTicket: row.maximumTicket,
    ticketCurrency,
    eligibilityNote,
    updatedAt: row.updatedAt,
    complete:
      sectors.length > 0 &&
      stages.length > 0 &&
      geographies.length > 0 &&
      /^[A-Z]{3}$/.test(ticketCurrency) &&
      eligibilityNote.length >= 20,
  };
}

export function matchOpportunityToInvestor(
  profile: InvestorPreferenceProfile | null,
  opportunity: MatchableOpportunity,
): OpportunityProfileMatch {
  if (!profile?.complete) return { score: null, reasons: [] };

  let availableWeight = 0;
  let matchedWeight = 0;
  const reasons: string[] = [];

  if (profile.sectors.length > 0 && opportunity.sector) {
    availableWeight += 35;
    if (includesPreference(profile.sectors, opportunity.sector)) {
      matchedWeight += 35;
      reasons.push(`Sector: ${opportunity.sector}`);
    }
  }

  if (profile.stages.length > 0 && opportunity.stage) {
    availableWeight += 25;
    if (includesPreference(profile.stages, opportunity.stage)) {
      matchedWeight += 25;
      reasons.push(`Stage: ${opportunity.stage.replaceAll("_", " ")}`);
    }
  }

  if (profile.geographies.length > 0 && opportunity.geography) {
    availableWeight += 20;
    if (includesPreference(profile.geographies, opportunity.geography)) {
      matchedWeight += 20;
      reasons.push(`Region: ${opportunity.geography}`);
    }
  }

  if (
    opportunity.minimumParticipation !== null &&
    profile.maximumTicket !== null &&
    profile.ticketCurrency === opportunity.raiseCurrency.toUpperCase()
  ) {
    availableWeight += 20;
    if (profile.maximumTicket >= opportunity.minimumParticipation) {
      matchedWeight += 20;
      reasons.push("Ticket range fits the listed minimum");
    }
  }

  return {
    score:
      availableWeight > 0
        ? Math.round((matchedWeight / availableWeight) * 100)
        : null,
    reasons,
  };
}
