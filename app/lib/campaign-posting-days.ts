export const postingDays = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
] as const;

export function parsePostingDays(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed.filter(
          (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6,
        ),
      ),
    );
  } catch {
    return [];
  }
}

export function minimumPostingDays(cadence: string) {
  if (cadence === "daily_posting") return 1;
  if (cadence.startsWith("weekly_"))
    return Number(cadence.slice("weekly_".length)) || 1;
  return 1;
}
