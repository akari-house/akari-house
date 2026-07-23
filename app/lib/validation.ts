import { roles, visibilities, type Role, type Visibility } from "./domain";

const usernamePattern = /^[a-z0-9][a-z0-9-]{2,29}$/;

export function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export function normalizeEmail(value: FormDataEntryValue | null) {
  return formText(value).trim().toLowerCase();
}

export function normalizeUsername(value: FormDataEntryValue | null) {
  return formText(value).trim().toLowerCase();
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function validateUsername(username: string) {
  return usernamePattern.test(username);
}

export function normalizeWebsite(value: FormDataEntryValue | null) {
  const website = formText(value).trim();
  if (!website) return "";
  try {
    const parsed = new URL(website);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function selectedRoles(formData: FormData): Role[] {
  return formData
    .getAll("roles")
    .filter((value): value is string => typeof value === "string")
    .filter((value): value is Role => roles.includes(value as Role));
}

export function selectedVisibility(
  value: FormDataEntryValue | null,
): Visibility {
  const candidate = typeof value === "string" ? value : "private";
  return visibilities.includes(candidate as Visibility)
    ? (candidate as Visibility)
    : "private";
}
