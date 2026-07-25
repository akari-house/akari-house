import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = new URL(
  process.env.AKARI_PRODUCTION_URL ?? "https://akarihouse.com",
);
const output =
  process.argv[2] ?? "launch-gate-artifacts/production-report.json";
const expectedRelease =
  process.env.AKARI_EXPECTED_RELEASE ?? "launch-completion-2026-07-26";
const sessionSecret = process.env.AKARI_SMOKE_SESSION_COOKIE ?? "";
const sessionCookie = sessionSecret.includes("=")
  ? sessionSecret
  : sessionSecret
    ? `akari_session=${sessionSecret}`
    : "";
const checks = [];

async function run(checkKey, persona, routeOrAction, assertion) {
  try {
    const observedResult = await assertion();
    checks.push({
      checkKey,
      persona,
      routeOrAction,
      expectedResult: "Production smoke assertions pass",
      observedResult,
      status: "passed",
      project: "production-smoke",
      traceReference: null,
    });
  } catch (error) {
    checks.push({
      checkKey,
      persona,
      routeOrAction,
      expectedResult: "Production smoke assertions pass",
      observedResult: error instanceof Error ? error.message : String(error),
      status: "failed",
      project: "production-smoke",
      traceReference: null,
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await run(
  "production_config",
  "system",
  "GET /health reports ready bindings and current release",
  async () => {
    const response = await fetch(new URL("/health", baseUrl), {
      redirect: "manual",
    });
    const body = await response.json();
    assert(response.status === 200, `Health returned ${response.status}`);
    assert(body.status === "ready", `Health status is ${body.status}`);
    assert(
      body.release === expectedRelease,
      `Expected release ${expectedRelease}, observed ${body.release ?? "missing"}`,
    );
    assert(
      Object.values(body.checks ?? {}).every(Boolean),
      "One or more production health checks are not ready",
    );
    return `ready release ${body.release}`;
  },
);

await run(
  "visitor",
  "visitor",
  "Public home works and /app redirects to login",
  async () => {
    const home = await fetch(baseUrl, { redirect: "manual" });
    assert(home.status === 200, `Home returned ${home.status}`);
    const app = await fetch(new URL("/app", baseUrl), { redirect: "manual" });
    assert(app.status === 302, `/app returned ${app.status}`);
    assert(
      (app.headers.get("location") ?? "").startsWith("/login"),
      "Protected route did not redirect to login",
    );
    return "home 200; protected route redirected";
  },
);

await run(
  "private_media",
  "visitor",
  "Unauthenticated private media cannot be read",
  async () => {
    const response = await fetch(
      new URL("/media/profile/launch-gate-production-probe", baseUrl),
      { redirect: "manual" },
    );
    assert(
      [302, 403, 404].includes(response.status),
      `Private media returned ${response.status}`,
    );
    return `private media denied with ${response.status}`;
  },
);

await run(
  "request_security",
  "visitor",
  "Cross-origin logout is rejected",
  async () => {
    const response = await fetch(new URL("/logout", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: { Origin: "https://attacker.example" },
    });
    assert(
      response.status === 403,
      `Cross-origin logout returned ${response.status}`,
    );
    return "cross-origin state change rejected";
  },
);

await run(
  "production_smoke",
  "superadmin",
  "Production-only test routes stay closed and approved smoke session reaches protected consoles",
  async () => {
    const fixture = await fetch(
      new URL("/__test__/personas/founder", baseUrl),
      { redirect: "manual" },
    );
    assert(fixture.status === 404, `Fixture route returned ${fixture.status}`);
    const securityFixture = await fetch(
      new URL("/__test__/launch-security/account-state", baseUrl),
      {
        method: "POST",
        redirect: "manual",
        headers: { "x-akari-test-fixture": "launch-gate-v1" },
      },
    );
    assert(
      securityFixture.status === 404,
      `Security fixture returned ${securityFixture.status}`,
    );
    assert(
      sessionCookie,
      "AKARI_SMOKE_SESSION_COOKIE is required for authenticated production evidence",
    );
    const headers = { Cookie: sessionCookie };
    const app = await fetch(new URL("/app", baseUrl), {
      redirect: "manual",
      headers,
    });
    assert(app.status === 200, `Authenticated /app returned ${app.status}`);
    const gate = await fetch(new URL("/admin/launch-gate", baseUrl), {
      redirect: "manual",
      headers,
    });
    assert(
      gate.status === 200,
      `Authenticated /admin/launch-gate returned ${gate.status}`,
    );
    return "test fixtures closed; member and Superadmin consoles reachable";
  },
);

const report = {
  schemaVersion: 1,
  source: "automated_production",
  environment: baseUrl.origin,
  commitSha: process.env.GITHUB_SHA ?? null,
  generatedAt: new Date().toISOString(),
  status: checks.some((check) => check.status === "failed")
    ? "failed"
    : "passed",
  totalChecks: checks.length,
  passedChecks: checks.filter((check) => check.status === "passed").length,
  failedChecks: checks.filter((check) => check.status === "failed").length,
  skippedChecks: 0,
  checks,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `Production launch gate: ${report.passedChecks}/${report.totalChecks} passed.\n`,
);
if (report.status === "failed") process.exitCode = 1;
