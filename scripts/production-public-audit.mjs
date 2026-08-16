import { writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const fetch = globalThis.fetch;
const baseUrl = new URL(process.env.PRODUCTION_URL || "https://akarihouse.com");
const expectedRelease = process.env.EXPECTED_RELEASE || "";
const checks = [];
const genericErrorCopy = "the lantern went out unexpectedly";

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
  if (!allowed.includes(response.status))
    throw new Error(`${label} returned HTTP ${response.status}.`);
}

async function requireAkariPage(path, label, init = {}) {
  const response = await request(path, { redirect: "follow", ...init });
  requireStatus(response, [200], label);
  const body = await response.text();
  const normalized = body.toLowerCase();
  if (!normalized.includes("akari"))
    throw new Error(`${label} did not render the AKARI application shell.`);
  if (normalized.includes(genericErrorCopy))
    throw new Error(`${label} rendered the generic AKARI error boundary.`);
  return `HTTP ${response.status}`;
}

async function requireLoginForm(init = {}) {
  const response = await request("/login", { redirect: "follow", ...init });
  requireStatus(response, [200], "Login");
  const body = await response.text();
  const normalized = body.toLowerCase();
  if (normalized.includes(genericErrorCopy))
    throw new Error("Login rendered the generic AKARI error boundary.");
  if (!body.includes("Return to the House"))
    throw new Error("Login heading was not rendered.");
  if (!body.includes('name="email"') || !body.includes('name="password"'))
    throw new Error("Login email and password controls were not rendered.");
  return `HTTP ${response.status} · login form rendered`;
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
    throw new Error(
      `Homepage resolved to unexpected host ${finalUrl.hostname}.`,
    );
  const body = await response.text();
  if (!body.toLowerCase().includes("akari"))
    throw new Error("Homepage does not contain the AKARI product identity.");
  return finalUrl.origin;
});

const publicMenuRoutes = [
  ["projects", "/projects", "Projects"],
  ["deals", "/deals", "Investor deals"],
  ["campaigns", "/campaigns", "Creator campaigns"],
  ["events", "/events", "Events"],
  ["archive", "/archive", "Archive"],
  ["membership", "/membership", "Membership"],
  ["community_guidelines", "/community-guidelines", "Community guidelines"],
  ["contact", "/contact", "Contact"],
  ["privacy", "/privacy", "Privacy"],
  ["terms", "/terms", "Terms"],
  ["login", "/login", "Login"],
  ["register", "/register", "Registration"],
];

for (const [key, path, label] of publicMenuRoutes) {
  await record(`public_${key}`, `${label} remains publicly reachable`, () =>
    requireAkariPage(path, label),
  );
}

await record("login_form", "Login renders the actual authentication form", () =>
  requireLoginForm(),
);

const sessionFaultProfiles = [
  ["stale", "akari_session=stale-session-token"],
  ["malformed", "akari_session=%E0%A4%A"],
];

for (const [profile, cookie] of sessionFaultProfiles) {
  for (const [key, path, label] of publicMenuRoutes) {
    await record(
      `public_${key}_${profile}_session`,
      `${label} remains available with a ${profile} session cookie`,
      () =>
        requireAkariPage(path, label, {
          headers: { Cookie: cookie },
        }),
    );
  }
  await record(
    `login_form_${profile}_session`,
    `Login form renders with a ${profile} session cookie`,
    () => requireLoginForm({ headers: { Cookie: cookie } }),
  );
}

const protectedRoutes = [
  ["member_auth", "/app", "Member dashboard"],
  ["members_auth", "/members", "Member directory"],
  ["connections_auth", "/connections", "Connections"],
  ["notifications_auth", "/notifications", "Notifications"],
  ["account_auth", "/settings/account", "Account settings"],
  ["telegram_auth", "/settings/telegram", "Telegram settings"],
  ["investor_settings_auth", "/settings/investor", "Investor preferences"],
  ["operations_auth", "/admin/operations", "Operations administration"],
  ["production_auth", "/admin/production", "Production administration"],
  ["launch_gate_auth", "/admin/launch-gate", "Launch-gate administration"],
  [
    "opportunity_admin_auth",
    "/admin/opportunities",
    "Opportunity administration",
  ],
  [
    "opportunity_documents_auth",
    "/admin/opportunities/documents",
    "Opportunity document administration",
  ],
];

for (const [key, path, label] of protectedRoutes) {
  await record(key, `${label} requires authentication`, async () => {
    const response = await request(path);
    requireStatus(response, [302, 303, 307, 308], label);
    const location = response.headers.get("location") || "";
    if (!location.includes("/login"))
      throw new Error(`${label} redirected to ${location || "no location"}.`);
    return `redirected to ${location}`;
  });
}

await record(
  "fixtures_disabled",
  "All local test fixtures are disabled publicly",
  async () => {
    const probes = [
      { path: "/__test__/personas/superadmin", method: "GET" },
      { path: "/__test__/launch-security/account-state", method: "POST" },
      { path: "/__test__/opportunities/state", method: "POST" },
      { path: "/__test__/opportunity-documents/state", method: "POST" },
      { path: "/__test__/campaign-closeout/seed", method: "POST" },
    ];
    for (const probe of probes) {
      const response = await request(probe.path, {
        method: probe.method,
        headers: { "x-akari-test-fixture": "launch-gate-v1" },
      });
      requireStatus(response, [404], `Test fixture ${probe.path}`);
    }
    return `${probes.length} fixture families returned HTTP 404`;
  },
);

await record(
  "security_headers",
  "Public responses include security headers",
  async () => {
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
  },
);

const failed = checks.filter((check) => check.status === "failed");
const report = {
  schemaVersion: 4,
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
