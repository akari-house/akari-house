export type ProjectReadinessInput = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  seeking: string;
  logoKey: string | null;
  bannerKey: string | null;
  hasWebsite: boolean;
  socialCount: number;
};

export type ProjectReadinessItem = {
  key: "story" | "needs" | "logo" | "banner" | "website" | "socials";
  label: string;
  complete: boolean;
  href: string;
};

export type ProjectReadiness = {
  score: number;
  completed: number;
  total: number;
  status: "starting" | "building" | "strong" | "ready";
  items: ProjectReadinessItem[];
  nextAction: ProjectReadinessItem | null;
};

export function buildProjectReadiness(
  project: ProjectReadinessInput,
): ProjectReadiness {
  const editHref = `/projects/${project.slug}/edit`;
  const brandHref = `/projects/${project.slug}/edit/brand`;

  const items: ProjectReadinessItem[] = [
    {
      key: "story",
      label: "Complete the project story",
      complete:
        project.title.trim().length >= 3 &&
        project.summary.trim().length >= 20 &&
        project.description.trim().length >= 80,
      href: editHref,
    },
    {
      key: "needs",
      label: "Choose current support needs",
      complete: project.seeking.trim().length > 0,
      href: `/projects/${project.slug}/needs`,
    },
    {
      key: "logo",
      label: "Add a project logo",
      complete: Boolean(project.logoKey),
      href: brandHref,
    },
    {
      key: "banner",
      label: "Add a project banner",
      complete: Boolean(project.bannerKey),
      href: brandHref,
    },
    {
      key: "website",
      label: "Add the official website",
      complete: project.hasWebsite,
      href: `${editHref}#project-channels`,
    },
    {
      key: "socials",
      label: "Add at least one social channel",
      complete: project.socialCount >= 2,
      href: `${editHref}#project-channels`,
    },
  ];

  const completed = items.filter((item) => item.complete).length;
  const score = Math.round((completed / items.length) * 100);
  const status =
    score === 100
      ? "ready"
      : score >= 70
        ? "strong"
        : score >= 40
          ? "building"
          : "starting";

  return {
    score,
    completed,
    total: items.length,
    status,
    items,
    nextAction: items.find((item) => !item.complete) ?? null,
  };
}
