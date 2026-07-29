import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.argv[2] ?? "launch-gate-artifacts/pagespeed";
const strategies = ["mobile", "desktop"];

function score(category) {
  const value = category?.score;
  return typeof value === "number" ? Math.round(value * 100) : null;
}

function auditMetric(audits, id) {
  const audit = audits?.[id];
  return audit
    ? {
        numericValue: audit.numericValue ?? null,
        displayValue: audit.displayValue ?? null,
        score: audit.score ?? null,
      }
    : null;
}

const summaries = [];

for (const strategy of strategies) {
  const reportPath = path.join(outputDirectory, `${strategy}-full.json`);
  const body = JSON.parse(await readFile(reportPath, "utf8"));
  const categories = body.categories ?? {};
  const audits = body.audits ?? {};
  const summary = {
    strategy,
    targetUrl: body.requestedUrl ?? "https://akarihouse.com",
    finalUrl: body.finalDisplayedUrl ?? body.finalUrl ?? null,
    fetchedAt: body.fetchTime ?? new Date().toISOString(),
    lighthouseVersion: body.lighthouseVersion ?? null,
    userAgent: body.userAgent ?? null,
    scores: {
      performance: score(categories.performance),
      accessibility: score(categories.accessibility),
      bestPractices: score(categories["best-practices"]),
      seo: score(categories.seo),
    },
    lab: {
      firstContentfulPaint: auditMetric(audits, "first-contentful-paint"),
      largestContentfulPaint: auditMetric(audits, "largest-contentful-paint"),
      totalBlockingTime: auditMetric(audits, "total-blocking-time"),
      cumulativeLayoutShift: auditMetric(audits, "cumulative-layout-shift"),
      speedIndex: auditMetric(audits, "speed-index"),
      timeToInteractive: auditMetric(audits, "interactive"),
    },
    coreWebVitalsInterpretation: {
      largestContentfulPaintTargetMs: 2500,
      cumulativeLayoutShiftTarget: 0.1,
      interactionToNextPaintTargetMs: 200,
      note:
        "Lighthouse is controlled lab evidence. It reports LCP and CLS directly; Total Blocking Time is a lab responsiveness diagnostic, not field INP. Field Core Web Vitals require CrUX data.",
    },
    warnings: body.runWarnings ?? [],
  };
  summaries.push(summary);
  await writeFile(
    path.join(outputDirectory, `${strategy}-summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

const combined = {
  schemaVersion: 1,
  source: "lighthouse_cli_controlled_lab",
  targetUrl: "https://akarihouse.com",
  generatedAt: new Date().toISOString(),
  fieldDataAvailable: false,
  results: summaries,
};

await writeFile(
  path.join(outputDirectory, "summary.json"),
  `${JSON.stringify(combined, null, 2)}\n`,
);

for (const result of summaries) {
  process.stdout.write(
    `${result.strategy}: performance ${result.scores.performance}, accessibility ${result.scores.accessibility}, best practices ${result.scores.bestPractices}, SEO ${result.scores.seo}, LCP ${result.lab.largestContentfulPaint?.displayValue}, CLS ${result.lab.cumulativeLayoutShift?.displayValue}, TBT ${result.lab.totalBlockingTime?.displayValue}\n`,
  );
}
