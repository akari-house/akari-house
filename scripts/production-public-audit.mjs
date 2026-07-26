import { writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const fetch = globalThis.fetch;
const baseUrl = new URL(
  process.env.PRODUCTION_URL || "https://akarihouse.com",
);
const expectedRelease = process.env.EXPECTED_RELEASE || "";
const checks = [];

async function record(key, label, run) {
  try {
    const detail = await run();
    checks.push({ key, label, status: "passed", detail });
  } catch (error) {
    checks.push({
      key,
      label,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function request(path, init = {}) {
  return fetch(new URL(path, baseUrl), {
    redirect: "manual",
    signal: globalThis.AbortSignal.timeout(20_000),
    ...init,
  });
}

function requireStatus(response, allowed, label) {
  if (!allowed.includes(response.status)) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
}

await record("health", "Health endpoint and release identity", async () => {
  const response = await request("/health", { redirect: "follow" });
  requireStatus(response, [200], "Health endpoint");
  const payload = await response.json();
  if (payload.status !== "ready")
    throw new Error(`Health status is ${JSON.stringify(payload.status)}.`);
  if (expectedRelease && payload.release !== expectedRelease)
    throw new Error(
      `Expected release ${expectedRelease}, received ${JSON.stringify(payload.release)}.`,
    );
  return `ready · release ${payload.release ?? "not reported"}`;
});

await record("custom_domain", "Custom domain serves AKARI", async () => {
  const response = await request("/", { redirect: "follow" });
  requireStatus(response, [200], "Homepage");
  const finalUrl = new URL(response.url);
  if (finalUrl.hostname !== baseUrl.hostname)
    throw new Error(`Homepage resolved to unexpected host ${finalUrl.hostname}.`);
  const body = await response.text();
  if (!body.toLowerCase().includes("akari"))
    throw new Error("Homepage does not contain the AKARI product identity.");
  return finalUrl.origin;
});

await record("login_public", "Login route remains publicly available", async () => {
  const response = await request("/login");
  requireStatus(response, [200], "Login route");
  return "HTTP 200";
});

for (const [key, path, label] of [
  ["member_auth", "/app", "Member application"],
  ["operations_auth", "/admin/operations", "Operations administration"],
  ["production_auth", "/admin/production", "Production administration"],
  ["launch_gate_auth", "/admin/launch-gate", "Launch-gate administration"],
]) {
  await record(key, `${label} requires authentication`, async () => {
    const response = await request(path);
    requireStatus(response, [302, 303, 307, 308], label);
    const location = response.headers.get("location") || "";
    if (!location.includes("/login"))
      throw new Error(`${label} redirected to ${location || "no location"}.`);
    return `redirected to ${location}`;
  });
}

await record("fixtures_disabled", "Local test fixtures are disabled publicly", async () => {
  const response = await request("/__test__/personas/superadmin", {
    headers: { "x-akari-test-fixture": "launch-gate" },
  });
  requireStatus(response, [404], "Test fixture route");
  return "HTTP 404";
});

await record("security_headers", "Public responses include security headers", async () => {
  const response = await request("/", { redirect: "follow" });
  requireStatus(response, [200], "Homepage");
  const required = [
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
  ];
  const missing = required.filter((header) => !response.headers.get(header));
  if (missing.length > 0)
    throw new Error(`Missing headers: ${missing.join(", ")}.`);
  return required.join(", ");
});

const failed = checks.filter((check) => check.status === "failed");
const report = {
  schemaVersion: 1,
  environment: "production",
  baseUrl: baseUrl.origin,
  commitSha: process.env.GITHUB_SHA || null,
  workflowUrl:
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  completedAt: new Date().toISOString(),
  status: failed.length === 0 ? "passed" : "failed",
  checks,
};

await writeFile(
  process.env.PRODUCTION_AUDIT_PATH || "production-audit.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
