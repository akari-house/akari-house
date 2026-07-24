export type ProjectNeed =
  | "fundraising"
  | "gtm_marketing"
  | "creator_kol"
  | "community"
  | "partnerships"
  | "product_feedback"
  | "hiring"
  | "technical"
  | "ecosystem"
  | "pr_media";

export const projectNeedOptions: Array<{
  value: ProjectNeed;
  label: string;
  description: string;
}> = [
  {
    value: "fundraising",
    label: "Fundraising",
    description: "Investor discovery, fundraising preparation and relevant introductions.",
  },
  {
    value: "gtm_marketing",
    label: "GTM & marketing",
    description: "Positioning, market entry, growth planning and execution support.",
  },
  {
    value: "creator_kol",
    label: "Creator & KOL campaign",
    description: "Creator discovery, campaign design and coordinated activation.",
  },
  {
    value: "community",
    label: "Community building",
    description: "Community strategy, moderation, activation and retention.",
  },
  {
    value: "partnerships",
    label: "Strategic partnerships",
    description: "Ecosystem, distribution, institutional and commercial partnerships.",
  },
  {
    value: "product_feedback",
    label: "Product feedback & beta users",
    description: "Structured feedback, testing groups and early product adoption.",
  },
  {
    value: "hiring",
    label: "Hiring & talent",
    description: "Introductions to operators, advisors, developers and specialist talent.",
  },
  {
    value: "technical",
    label: "Product & technical support",
    description: "Architecture, development, security and product-delivery assistance.",
  },
  {
    value: "ecosystem",
    label: "Ecosystem integrations",
    description: "Infrastructure, launchpad, exchange and ecosystem-access support.",
  },
  {
    value: "pr_media",
    label: "PR & media exposure",
    description: "Media positioning, announcements, interviews and communications support.",
  },
];

const validNeeds = new Set<ProjectNeed>(
  projectNeedOptions.map((option) => option.value),
);

export type ParsedProjectSeeking = {
  needs: ProjectNeed[];
  other: string;
};

export function parseProjectSeeking(
  raw: string | null | undefined,
): ParsedProjectSeeking {
  const value = raw?.trim() ?? "";
  if (!value) return { needs: [], other: "" };

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return {
        needs: parsed.filter(
          (item): item is ProjectNeed =>
            typeof item === "string" && validNeeds.has(item as ProjectNeed),
        ),
        other: "",
      };
    }
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as { needs?: unknown; other?: unknown };
      const needs = Array.isArray(candidate.needs)
        ? candidate.needs.filter(
            (item): item is ProjectNeed =>
              typeof item === "string" && validNeeds.has(item as ProjectNeed),
          )
        : [];
      return {
        needs: [...new Set(needs)],
        other: typeof candidate.other === "string" ? candidate.other.trim() : "",
      };
    }
  } catch {
    // Legacy projects stored a free-text seeking field. Keep that text visible.
  }

  return { needs: [], other: value };
}

export function projectSeekingFromForm(form: FormData) {
  const needs = [
    ...new Set(
      form
        .getAll("projectNeed")
        .map((item) => String(item))
        .filter((item): item is ProjectNeed =>
          validNeeds.has(item as ProjectNeed),
        ),
    ),
  ];
  const other = String(form.get("seekingOther") ?? "").trim();

  if (!needs.length && !other)
    return {
      value: "",
      needs,
      other,
      error: "Select at least one type of support or describe another need.",
    };
  if (other.length > 160)
    return {
      value: "",
      needs,
      other,
      error: "Keep the additional project need within 160 characters.",
    };

  return {
    value: JSON.stringify({ needs, other }),
    needs,
    other,
    error: null,
  };
}

export function projectNeedLabel(need: ProjectNeed) {
  return (
    projectNeedOptions.find((option) => option.value === need)?.label ?? need
  );
}

export function projectHasNeed(
  raw: string | null | undefined,
  need: ProjectNeed,
) {
  return parseProjectSeeking(raw).needs.includes(need);
}
