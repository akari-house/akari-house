import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("authentication password experience", () => {
  it("provides an accessible reusable visibility control", () => {
    const passwordField = read("app/components/PasswordField.tsx");
    expect(passwordField).toContain('type={visible ? "text" : "password"}');
    expect(passwordField).toContain("aria-pressed={visible}");
    expect(passwordField).toContain('type="button"');
    expect(passwordField).toContain('aria-live="polite"');
    expect(passwordField).toContain("autoComplete={autoComplete}");
    expect(passwordField).toContain("data-password-field={name}");
    expect(passwordField).toContain("Show entered characters");
    expect(passwordField).toContain("Hide entered characters");
    // Keep control names independent from field labels for unambiguous queries.
    expect(passwordField).not.toContain("Show ${label.toLowerCase()}");
    expect(passwordField).not.toContain("Hide ${label.toLowerCase()}");
    expect(passwordField).toContain("setCustomValidity");
  });

  it("shows immediate registration acceptance and matching feedback", () => {
    const register = read("app/routes/register.tsx");
    expect(register).toContain("Password length accepted.");
    expect(register).toContain("Passwords do not match yet.");
    expect(register).toContain("Passwords match.");
    expect(register).toContain("12 to 128 characters required.");
    expect(register).toContain('aria-label="Membership request steps"');
    expect(register).toContain("Confirm your email, then await human review.");
  });

  it("places rejected login credentials beside the password field", () => {
    const login = read("app/routes/login.tsx");
    expect(login).toContain('errorField: "credentials" as const');
    expect(login).toContain('actionData?.errorField === "credentials"');
    expect(login).toContain("error={credentialError}");
    expect(login).toContain("Passwords are case-sensitive.");
  });

  it("loads the dedicated responsive authentication styles", () => {
    const root = read("app/root.tsx");
    const styles = read("app/styles/auth-experience.css");
    expect(root).toContain('import "./styles/auth-experience.css"');
    expect(styles).toContain(".password-visibility-toggle");
    expect(styles).toContain(".auth-form-section");
    expect(styles).toContain("@media (max-width: 680px)");
  });
});
