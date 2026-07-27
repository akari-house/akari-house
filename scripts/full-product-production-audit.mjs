import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox, webkit } from "@playwright/test";

const baseUrl = new URL(process.env.PRODUCTION_URL || "https://akarihouse.com");
const outputDirectory = process.env.AUDIT_DIR || "audit-results";
const screenshotDirectory = `${outputDirectory}/screenshots`;
const genericErrorCopy = "the lantern went out unexpectedly";

await mkdir(screenshotDirectory, { recursive: true });

const publicRoutes = [
  { key: "home", path: "/", label: "Homepage" },
  { key: "projects", path: "/projects", label: "Projects" },
  { key: "deals", path: "/deals", label: "Investor deals" },
  { key: "campaigns", path: "/campaigns", label: "Creator campaigns" },
  { key: "events", path: "/events", label: "Events" },
  { key: "archive", path: "/archive", label: "Archive" },
  { key: "membership", path: "/membership", label: "Membership" },
  {
    key: "community-guidelines",
    path: "/community-guidelines",
    label: "Community guidelines",
  },
  { key: "contact", path: "/contact", label: "Contact" },
  { key: "privacy", path: "/privacy", label: "Privacy" },
  { key: "terms", path: "/terms", label: "Terms" },
  { key: "login", path: "/login", label: "Login" },
  { key: "register", path: "/register", label: "Registration" },
];

const protectedRoutes = [
  { key: "app", path: "/app", label: "Member dashboard" },
  { key: "members", path: "/members", label: "Members" },
  { key: "connections", path: "/connections", label: "Connections" },
  { key: "notifications", path: "/notifications", label: "Notifications" },
  {
    key: "account-settings",
    path: "/settings/account",
    label: "Account settings",
  },
  {
    key: "investor-settings",
    path: "/settings/investor",
    label: "Investor settings",
  },
  {
    key: "admin-launch-gate",
    path: "/admin/launch-gate",
    label: "Launch gate administration",
  },
  {
    key: "admin-opportunities",
    path: "/admin/opportunities",
    label: "Opportunity administration",
  },
];

const profiles = [
  {
    name: "desktop-chromium",
    browser: "chromium",
    viewport: { width: 1440, height: 1000 },
    screenshot: true,
    accessibility: true,
  },
  {
    name: "laptop-chromium",
    browser: "chromium",
    viewport: { width: 1366, height: 768 },
  },
  {
    name: "tablet-chromium",
    browser: "chromium",
    viewport: { width: 768, height: 1024 },
  },
  {
    name: "mobile-chromium",
    browser: "chromium",
    viewport: { width: 390, height: 844 },
    screenshot: true,
    accessibility: true,
  },
  {
    name: "short-phone-chromium",
    browser: "chromium",
    viewport: { width: 320, height: 568 },
  },
  {
    name: "desktop-firefox",
    browser: "firefox",
    viewport: { width: 1440, height: 1000 },
  },
  {
    name: "desktop-webkit",
    browser: "webkit",
    viewport: { width: 1440, height: 1000 },
  },
];

const browserTypes = { chromium, firefox, webkit };
const results = [];
const authResults = [];

function sameOrigin(url) {
  try {
    return new URL(url).origin === baseUrl.origin;
  } catch {
    return false;
  }
}

function cleanConsoleMessage(message) {
  const text = message.text();
  const location = message.location();
  const source = `${location.url || ""} ${text}`.toLowerCase();
  if (
    source.includes("challenges.cloudflare.com") ||
    source.includes("turnstile") ||
    source.includes("favicon.ico")
  )
    return null;
  return {
    type: message.type(),
    text,
    location,
  };
}

function severityFor(result) {
  if (
    result.status >= 500 ||
    result.genericErrorBoundary ||
    result.firstPartyServerErrors.length > 0
  )
    return "P0";
  if (
    result.status !== 200 ||
    result.pageErrors.length > 0 ||
    result.firstPartyRequestFailures.length > 0 ||
    result.seriousAccessibilityViolations.length > 0 ||
    result.horizontalOverflow
  )
    return "P1";
  if (
    result.consoleErrors.length > 0 ||
    result.missingSecurityHeaders.length > 0 ||
    result.h1Count !== 1 ||
    result.mainLandmarkCount !== 1 ||
    result.largeFirstPartyResources.length > 0 ||
    result.loadMilliseconds > 5000
  )
    return "P2";
  return "PASS";
}

for (const browserName of Object.keys(browserTypes)) {
  const browser = await browserTypes[browserName].launch({ headless: true });
  try {
    for (const profile of profiles.filter(
      (candidate) => candidate.browser === browserName,
    )) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        locale: "en-GB",
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      try {
        for (const route of publicRoutes) {
          const page = await context.newPage();
          const consoleErrors = [];
          const pageErrors = [];
          const firstPartyRequestFailures = [];
          const firstPartyServerErrors = [];

          page.on("console", (message) => {
            if (message.type() !== "error") return;
            const cleaned = cleanConsoleMessage(message);
            if (cleaned) consoleErrors.push(cleaned);
          });
          page.on("pageerror", (error) => pageErrors.push(error.message));
          page.on("requestfailed", (request) => {
            if (!sameOrigin(request.url())) return;
            firstPartyRequestFailures.push({
              url: request.url(),
              resourceType: request.resourceType(),
              failure: request.failure()?.errorText || "unknown",
            });
          });
          page.on("response", (response) => {
            if (!sameOrigin(response.url()) || response.status() < 500) return;
            firstPartyServerErrors.push({
              url: response.url(),
              status: response.status(),
            });
          });

          const startedAt = Date.now();
          let navigationResponse = null;
          let navigationError = null;
          try {
            navigationResponse = await page.goto(
              new URL(route.path, baseUrl).toString(),
              {
                waitUntil: "domcontentloaded",
                timeout: 30_000,
              },
            );
            await page
              .waitForLoadState("networkidle", { timeout: 7_000 })
              .catch(() => undefined);
          } catch (error) {
            navigationError =
              error instanceof Error ? error.message : String(error);
          }
          const loadMilliseconds = Date.now() - startedAt;

          const bodyText = await page
            .locator("body")
            .innerText()
            .catch(() => "");
          const normalizedBody = bodyText.toLowerCase();
          const layout = await page
            .evaluate(() => ({
              horizontalOverflow:
                document.documentElement.scrollWidth > window.innerWidth + 2,
              documentWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth,
              h1Count: document.querySelectorAll("h1").length,
              mainLandmarkCount: document.querySelectorAll("main").length,
              navigationLandmarkCount: document.querySelectorAll(
                "nav,[role='navigation']",
              ).length,
              activeElement: document.activeElement?.tagName || null,
              resources: performance
                .getEntriesByType("resource")
                .map((entry) => ({
                  name: entry.name,
                  transferSize: entry.transferSize || 0,
                  duration: entry.duration || 0,
                  initiatorType: entry.initiatorType,
                })),
            }))
            .catch(() => ({
              horizontalOverflow: false,
              documentWidth: 0,
              viewportWidth: profile.viewport.width,
              h1Count: 0,
              mainLandmarkCount: 0,
              navigationLandmarkCount: 0,
              activeElement: null,
              resources: [],
            }));

          const largeFirstPartyResources = layout.resources.filter(
            (resource) => {
              if (!sameOrigin(resource.name)) return false;
              return resource.transferSize > 1_500_000;
            },
          );

          const headers = navigationResponse
            ? await navigationResponse.allHeaders()
            : {};
          const requiredSecurityHeaders = [
            "content-security-policy",
            "x-content-type-options",
            "referrer-policy",
          ];
          if (baseUrl.protocol === "https:")
            requiredSecurityHeaders.push("strict-transport-security");
          const missingSecurityHeaders = requiredSecurityHeaders.filter(
            (header) => !headers[header],
          );

          let accessibilityViolations = [];
          if (profile.accessibility && navigationResponse?.status() === 200) {
            try {
              const axe = await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
                .analyze();
              accessibilityViolations = axe.violations.map((violation) => ({
                id: violation.id,
                impact: violation.impact,
                help: violation.help,
                helpUrl: violation.helpUrl,
                nodes: violation.nodes.map((node) => ({
                  target: node.target,
                  html: node.html.slice(0, 500),
                  failureSummary: node.failureSummary,
                })),
              }));
            } catch (error) {
              accessibilityViolations = [
                {
                  id: "axe-run-failed",
                  impact: "serious",
                  help: error instanceof Error ? error.message : String(error),
                  helpUrl: null,
                  nodes: [],
                },
              ];
            }
          }

          const seriousAccessibilityViolations = accessibilityViolations.filter(
            (violation) =>
              violation.impact === "critical" || violation.impact === "serious",
          );

          if (profile.screenshot) {
            await page
              .screenshot({
                path: `${screenshotDirectory}/${profile.name}-${route.key}.png`,
                fullPage: true,
              })
              .catch(() => undefined);
          }

          const result = {
            profile: profile.name,
            browser: browserName,
            viewport: profile.viewport,
            route,
            requestedUrl: new URL(route.path, baseUrl).toString(),
            finalUrl: page.url(),
            status: navigationResponse?.status() ?? 0,
            navigationError,
            loadMilliseconds,
            genericErrorBoundary: normalizedBody.includes(genericErrorCopy),
            horizontalOverflow: layout.horizontalOverflow,
            documentWidth: layout.documentWidth,
            viewportWidth: layout.viewportWidth,
            h1Count: layout.h1Count,
            mainLandmarkCount: layout.mainLandmarkCount,
            navigationLandmarkCount: layout.navigationLandmarkCount,
            consoleErrors,
            pageErrors,
            firstPartyRequestFailures,
            firstPartyServerErrors,
            largeFirstPartyResources,
            missingSecurityHeaders,
            accessibilityViolations,
            seriousAccessibilityViolations,
          };
          result.severity = severityFor(result);
          results.push(result);
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

const authBrowser = await chromium.launch({ headless: true });
try {
  const context = await authBrowser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
  });
  try {
    for (const route of protectedRoutes) {
      const page = await context.newPage();
      const response = await page.goto(
        new URL(route.path, baseUrl).toString(),
        {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        },
      );
      const finalUrl = page.url();
      const passed =
        finalUrl.includes("/login") &&
        !(await page.locator("body").innerText())
          .toLowerCase()
          .includes(genericErrorCopy);
      authResults.push({
        route,
        initialStatus: response?.status() ?? 0,
        finalUrl,
        passed,
        severity: passed ? "PASS" : "P0",
      });
      await page.close();
    }
  } finally {
    await context.close();
  }
} finally {
  await authBrowser.close();
}

const severityCounts = results.reduce(
  (counts, result) => {
    counts[result.severity] = (counts[result.severity] || 0) + 1;
    return counts;
  },
  { P0: 0, P1: 0, P2: 0, PASS: 0 },
);
for (const result of authResults) {
  severityCounts[result.severity] = (severityCounts[result.severity] || 0) + 1;
}

const uniqueAccessibilityIssues = new Map();
for (const result of results) {
  for (const violation of result.accessibilityViolations) {
    const key = `${violation.id}:${violation.impact}`;
    if (!uniqueAccessibilityIssues.has(key)) {
      uniqueAccessibilityIssues.set(key, {
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        occurrences: 0,
        routes: new Set(),
      });
    }
    const entry = uniqueAccessibilityIssues.get(key);
    entry.occurrences += violation.nodes.length || 1;
    entry.routes.add(`${result.profile}:${result.route.path}`);
  }
}

const accessibilitySummary = [...uniqueAccessibilityIssues.values()].map(
  (entry) => ({
    ...entry,
    routes: [...entry.routes],
  }),
);

const report = {
  schemaVersion: 1,
  environment: "production",
  baseUrl: baseUrl.origin,
  commitSha: process.env.GITHUB_SHA || null,
  completedAt: new Date().toISOString(),
  profiles: profiles.map(({ name, browser, viewport }) => ({
    name,
    browser,
    viewport,
  })),
  publicRouteCount: publicRoutes.length,
  protectedRouteCount: protectedRoutes.length,
  severityCounts,
  accessibilitySummary,
  results,
  authResults,
};

await writeFile(
  `${outputDirectory}/full-product-production-audit.json`,
  `${JSON.stringify(report, null, 2)}\n`,
);

const markdown = [
  "# AKARI House full production browser audit",
  "",
  `- Completed: ${report.completedAt}`,
  `- Base URL: ${report.baseUrl}`,
  `- Public routes: ${report.publicRouteCount}`,
  `- Protected routes: ${report.protectedRouteCount}`,
  `- Browser/viewport profiles: ${report.profiles.length}`,
  `- P0: ${severityCounts.P0}`,
  `- P1: ${severityCounts.P1}`,
  `- P2: ${severityCounts.P2}`,
  `- Passed checks: ${severityCounts.PASS}`,
  "",
  "## Non-passing checks",
  "",
  ...results
    .filter((result) => result.severity !== "PASS")
    .map(
      (result) =>
        `- **${result.severity}** ${result.profile} ${result.route.path}: status=${result.status}, overflow=${result.horizontalOverflow}, consoleErrors=${result.consoleErrors.length}, pageErrors=${result.pageErrors.length}, requestFailures=${result.firstPartyRequestFailures.length}, seriousA11y=${result.seriousAccessibilityViolations.length}, missingHeaders=${result.missingSecurityHeaders.join(",") || "none"}`,
    ),
  ...authResults
    .filter((result) => !result.passed)
    .map(
      (result) =>
        `- **P0** protected route ${result.route.path} did not finish at login: ${result.finalUrl}`,
    ),
  "",
  "## Accessibility issue families",
  "",
  ...accessibilitySummary.map(
    (issue) =>
      `- **${issue.impact || "unknown"}** ${issue.id}: ${issue.help} (${issue.occurrences} nodes across ${issue.routes.length} route/profile combinations)`,
  ),
  "",
].join("\n");

await writeFile(
  `${outputDirectory}/full-product-production-audit.md`,
  markdown,
);

process.stdout.write(
  `${JSON.stringify({ severityCounts, accessibilitySummary }, null, 2)}\n`,
);
