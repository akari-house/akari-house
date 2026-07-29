import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = new URL(
  process.env.AKARI_PRODUCTION_URL ?? "https://akarihouse.com",
);
const output =
  process.argv[2] ?? "launch-gate-artifacts/pr136-release-report.json";
const checks = [];

async function run(checkKey, routeOrAction, assertion) {
  try {
    const observedResult = await assertion();
    checks.push({
      checkKey,
      routeOrAction,
      expectedResult: "PR #136 release marker is live",
      observedResult,
      status: "passed",
    });
  } catch (error) {
    checks.push({
      checkKey,
      routeOrAction,
      expectedResult: "PR #136 release marker is live",
      observedResult: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(route, options = {}) {
  return fetch(new URL(route, baseUrl), {
    redirect: "manual",
    ...options,
  });
}

await run("homepage_seo", "GET /", async () => {
  const response = await get("/");
  const body = await response.text();
  assert(response.status === 200, `Homepage returned ${response.status}`);
  assert(
    body.includes('rel="canonical" href="https://akarihouse.com/"'),
    "Homepage canonical URL is missing",
  );
  assert(body.includes('type="application/ld+json"'), "Homepage JSON-LD is missing");
  assert(body.includes('rel="manifest"'), "Web App Manifest link is missing");
  return "canonical, JSON-LD and manifest are present";
});

await run("robots_and_sitemap", "GET /robots.txt and /sitemap.xml", async () => {
  const robots = await get("/robots.txt");
  const robotsBody = await robots.text();
  assert(robots.status === 200, `robots.txt returned ${robots.status}`);
  assert(
    robotsBody.includes("Sitemap: https://akarihouse.com/sitemap.xml"),
    "robots.txt does not advertise the production sitemap",
  );

  const sitemap = await get("/sitemap.xml");
  const sitemapBody = await sitemap.text();
  assert(sitemap.status === 200, `sitemap.xml returned ${sitemap.status}`);
  for (const route of ["/", "/projects", "/campaigns", "/deals"]) {
    assert(
      sitemapBody.includes(`<loc>https://akarihouse.com${route}</loc>`),
      `Sitemap is missing ${route}`,
    );
  }
  return "robots.txt and public sitemap are live";
});

await run("login_noindex", "GET /login", async () => {
  const response = await get("/login");
  const body = await response.text();
  const robotsHeader = response.headers.get("x-robots-tag") ?? "";
  assert(response.status === 200, `/login returned ${response.status}`);
  assert(
    robotsHeader.toLowerCase().includes("noindex") &&
      robotsHeader.toLowerCase().includes("nofollow"),
    `Unexpected X-Robots-Tag: ${robotsHeader || "missing"}`,
  );
  assert(
    body.includes('name="robots" content="noindex, nofollow"'),
    "Login document robots meta is missing",
  );
  assert(body.includes("AKARI House"), "Login document title/brand is missing");
  return "HTML and response headers exclude login from indexing";
});

await run("creator_campaign_journey", "GET /campaigns", async () => {
  const response = await get("/campaigns");
  const body = await response.text();
  assert(response.status === 200, `/campaigns returned ${response.status}`);
  assert(
    body.includes("From discovery to delivery"),
    "Creator campaign journey marker is missing",
  );
  return "Creator discovery-to-delivery journey is live";
});

await run("protected_redirect", "GET /app", async () => {
  const response = await get("/app");
  assert(response.status === 302, `/app returned ${response.status}`);
  const location = response.headers.get("location") ?? "";
  assert(location.startsWith("/login"), `Unexpected redirect: ${location}`);
  return `protected route redirected to ${location}`;
});

await run("private_media", "GET private media probe", async () => {
  const response = await get("/media/profile/launch-gate-production-probe");
  assert(
    [302, 403, 404].includes(response.status),
    `Private media returned ${response.status}`,
  );
  return `private media denied with ${response.status}`;
});

await run("cross_origin_protection", "POST /logout", async () => {
  const response = await get("/logout", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
  });
  assert(response.status === 403, `/logout returned ${response.status}`);
  return "cross-origin state change rejected";
});

const report = {
  schemaVersion: 1,
  source: "temporary_pr136_production_evidence",
  environment: baseUrl.origin,
  commitSha: process.env.GITHUB_SHA ?? null,
  generatedAt: new Date().toISOString(),
  status: checks.some((check) => check.status === "failed")
    ? "failed"
    : "passed",
  totalChecks: checks.length,
  passedChecks: checks.filter((check) => check.status === "passed").length,
  failedChecks: checks.filter((check) => check.status === "failed").length,
  checks,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `PR #136 release markers: ${report.passedChecks}/${report.totalChecks} passed.\n`,
);
if (report.status === "failed") process.exitCode = 1;
