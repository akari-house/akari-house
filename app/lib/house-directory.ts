export const houseDirectoryCategories = [
  "team",
  "advisor",
  "supporter",
  "partner",
  "provider",
] as const;

export type HouseDirectoryCategory = (typeof houseDirectoryCategories)[number];

export const houseDirectoryCategoryLabels: Record<
  HouseDirectoryCategory,
  string
> = {
  team: "AKARI Team",
  advisor: "Advisor",
  supporter: "Supporter",
  partner: "Partner",
  provider: "Value-Added / Solution Provider",
};

export function isHouseDirectoryOrganization(category: HouseDirectoryCategory) {
  return category === "partner" || category === "provider";
}

export type HouseDirectoryEntry = {
  id: string;
  category: HouseDirectoryCategory;
  name: string;
  title: string | null;
  biography: string | null;
  imageKey: string | null;
  websiteUrl: string | null;
  xUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  telegramUrl: string | null;
  displayOrder: number;
  status: "draft" | "published" | "archived";
  imageVersion: string;
};

export function houseDirectoryImageUrl(entry: HouseDirectoryEntry) {
  return `/media/house-directory/${entry.id}?v=${encodeURIComponent(
    entry.imageVersion,
  )}`;
}
