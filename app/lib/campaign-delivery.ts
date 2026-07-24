export type PostingCadence =
  | "daily_posting"
  | "weekly_2"
  | "weekly_3"
  | "weekly_4"
  | "daily_engagement";

export type SelectablePostingCadence = Exclude<
  PostingCadence,
  "daily_engagement"
>;

export const dailyEngagementRequirement = {
  label: "Daily engagement required",
  detail: "Comment, Like, Repost and Bookmark",
  actions: ["Comment", "Like", "Repost", "Bookmark"],
} as const;

export const postingCadences: Array<{
  value: SelectablePostingCadence;
  label: string;
}> = [
  { value: "daily_posting", label: "Daily posting" },
  { value: "weekly_2", label: "Weekly 2x posting" },
  { value: "weekly_3", label: "Weekly 3x posting" },
  { value: "weekly_4", label: "Weekly 4x posting" },
];

function utcDay(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid campaign date.");
  return date;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function expectedCampaignSlots(
  startsAt: string,
  endsAt: string,
  cadence: PostingCadence,
  asOf = new Date(),
) {
  if (cadence === "daily_engagement") return [];
  const start = utcDay(startsAt);
  const end = utcDay(endsAt);
  const today = utcDay(asOf.toISOString());
  const effectiveEnd = new Date(Math.min(end.getTime(), today.getTime()));
  if (effectiveEnd < start) return [];
  const daily = cadence === "daily_posting";
  const perWeek = daily ? 1 : Number(cadence.split("_")[1]);
  const slots: Array<{ periodStart: string; slotNumber: number }> = [];
  if (daily) {
    for (
      const cursor = new Date(start);
      cursor <= effectiveEnd;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    )
      slots.push({ periodStart: isoDay(cursor), slotNumber: 1 });
    return slots;
  }
  for (
    const cursor = new Date(start);
    cursor <= effectiveEnd;
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  ) {
    const periodStart = isoDay(cursor);
    for (let slotNumber = 1; slotNumber <= perWeek; slotNumber += 1)
      slots.push({ periodStart, slotNumber });
  }
  return slots;
}

export function campaignPayoutSuggestion(
  allocatedCents: number,
  expected: number,
  completed: number,
) {
  if (expected <= 0) return allocatedCents;
  const boundedCompleted = Math.min(expected, Math.max(0, completed));
  return Math.round(allocatedCents * (boundedCompleted / expected));
}
