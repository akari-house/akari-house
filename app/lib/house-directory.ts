export const houseDirectoryCategories = [
  "team",
  "advisor",
  "supporter",
  "partner",
  "provider",
] as const;

export type HouseDirectoryCategory = (typeof houseDirectoryCategories)[number];

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
};
