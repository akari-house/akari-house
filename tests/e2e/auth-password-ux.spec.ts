import { expect, test } from "@playwright/test";

test("registration explains password acceptance while typing", async ({
  page,
}) => {
  await page.goto("/register");

  await expect(
    page.getByRole("list", { name: "Membership request steps" }),
  ).toBeVisible();

  const password = page.getByLabel("Password", { exact: true });
  const confirmation = page.getByLabel("Confirm password");
  const showPassword = page.getByRole("button", {
    name: "Show password",
    exact: true,
  });

  await expect(password).toHaveAttribute("type", "password");
  await showPassword.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(
    page.getByRole("button", { name: "Hide password", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await password.fill("abcdefghijk");
  await expect(
    page.getByText("Add 1 more character.", { exact: true }),
  ).toBeVisible();
  await password.fill("abcdefghijkl");
  await expect(
    page.getByText("Password length accepted.", { exact: true }),
  ).toBeVisible();

  await confirmation.fill("abcdefghijkx");
  await expect(
    page.getByText("Passwords do not match yet.", { exact: true }),
  ).toBeVisible();
  await confirmation.fill("abcdefghijkl");
  await expect(
    page.getByText("Passwords match.", { exact: true }),
  ).toBeVisible();
});

test("login password can be reviewed without submitting", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  const showPassword = page.getByRole("button", {
    name: "Show password",
    exact: true,
  });

  await password.fill("visible-check");
  await showPassword.click();
  await expect(password).toHaveAttribute("type", "text");
  const hidePassword = page.getByRole("button", {
    name: "Hide password",
    exact: true,
  });
  await expect(hidePassword).toHaveAttribute("aria-pressed", "true");
  await hidePassword.click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(
    page.getByRole("button", { name: "Show password", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
