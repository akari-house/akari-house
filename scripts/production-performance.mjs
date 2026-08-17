/* global window, PerformanceObserver, performance */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const targetUrl = process.env.PRODUCTION_URL || "https://akarihouse.com";
const output =
  process.env.PERFORMANCE_REPORT_PATH ||
  "production-performance/production-performance.json";
const runsPerProfile = 3;

const profiles = [
  {
    key: "mobile",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    key: "desktop",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const profile of profiles) {
    for (let run = 1; run <= runsPerProfile; run += 1) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
        locale: "en-GB",
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__akariPerformance = { lcp: 0, cls: 0 };
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__akariPerformance.lcp = Math.max(
                window.__akariPerformance.lcp,
                entry.startTime,
              );
            }
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput)
                window.__akariPerformance.cls += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
        } catch {
          // Older engines may not expose every observer type. Navigation timing
          // is still recorded below and the report remains useful.
        }
      });

      const response = await page.goto(targetUrl, {
        waitUntil: "load",
        timeout: 45_000,
      });
      if (!response || response.status() !== 200)
        throw new Error(
          `${profile.key} run ${run} returned HTTP ${response?.status() ?? "no response"}`,
        );
      await page.waitForTimeout(2_500);
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource");
        return {
          lcpMs: Math.round(window.__akariPerformance?.lcp ?? 0),
          cls: Number((window.__akariPerformance?.cls ?? 0).toFixed(4)),
          domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
          loadMs: Math.round(nav?.loadEventEnd ?? 0),
          transferBytes: Math.round(
            resources.reduce(
              (sum, entry) => sum + (entry.transferSize || 0),
              0,
            ),
          ),
          resourceCount: resources.length,
        };
      });
      results.push({
        profile: profile.key,
        run,
        viewport: profile.viewport,
        ...metrics,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const summaries = Object.fromEntries(
  profiles.map((profile) => {
    const rows = results.filter((row) => row.profile === profile.key);
    return [
      profile.key,
      {
        runs: rows.length,
        medianLcpMs: median(rows.map((row) => row.lcpMs)),
        medianCls: median(rows.map((row) => row.cls)),
        medianDomContentLoadedMs: median(
          rows.map((row) => row.domContentLoadedMs),
        ),
        medianLoadMs: median(rows.map((row) => row.loadMs)),
        medianTransferBytes: median(rows.map((row) => row.transferBytes)),
        medianResourceCount: median(rows.map((row) => row.resourceCount)),
      },
    ];
  }),
);

const report = {
  schemaVersion: 1,
  targetUrl,
  generatedAt: new Date().toISOString(),
  commitSha: process.env.GITHUB_SHA || null,
  methodology:
    "Three fresh Chromium navigations per 390x844 mobile and 1440x900 desktop profile. Medians are reported; this is synthetic lab evidence, not CrUX field data.",
  targets: {
    lcpMs: 2500,
    cls: 0.1,
  },
  summaries,
  results,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
