import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const targetUrl = process.env.AKARI_PRODUCTION_URL ?? "https://akarihouse.com";
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

function fieldMetric(metrics, id) {
  const metric = metrics?.[id];
  return metric
    ? {
        percentile: metric.percentile ?? null,
        category: metric.category ?? null,
        distributions: metric.distributions ?? [],
      }
    : null;
}

await mkdir(outputDirectory, { recursive: true });
const summaries = [];

for (const strategy of strategies) {
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", targetUrl);
  endpoint.searchParams.set("strategy", strategy);
  for (const category of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]) {
    endpoint.searchParams.append("category", category);
  }

  const response = await fetch(endpoint);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `PageSpeed ${strategy} failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  await writeFile(
    path.join(outputDirectory, `${strategy}-full.json`),
    `${JSON.stringify(body, null, 2)}\n`,
  );

  const categories = body.lighthouseResult?.categories ?? {};
  const audits = body.lighthouseResult?.audits ?? {};
  const loadingMetrics = body.loadingExperience?.metrics ?? {};
  const originMetrics = body.originLoadingExperience?.metrics ?? {};
  const summary = {
    strategy,
    targetUrl,
    fetchedAt: body.analysisUTCTimestamp ?? new Date().toISOString(),
    finalUrl: body.lighthouseResult?.finalDisplayedUrl ?? body.id ?? targetUrl,
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
      interactionToNextPaint: auditMetric(audits, "interaction-to-next-paint"),
    },
    field: {
      url: {
        largestContentfulPaint: fieldMetric(
          loadingMetrics,
          "LARGEST_CONTENTFUL_PAINT_MS",
        ),
        interactionToNextPaint: fieldMetric(
          loadingMetrics,
          "INTERACTION_TO_NEXT_PAINT",
        ),
        cumulativeLayoutShift: fieldMetric(
          loadingMetrics,
          "CUMULATIVE_LAYOUT_SHIFT_SCORE",
        ),
      },
      origin: {
        largestContentfulPaint: fieldMetric(
          originMetrics,
          "LARGEST_CONTENTFUL_PAINT_MS",
        ),
        interactionToNextPaint: fieldMetric(
          originMetrics,
          "INTERACTION_TO_NEXT_PAINT",
        ),
        cumulativeLayoutShift: fieldMetric(
          originMetrics,
          "CUMULATIVE_LAYOUT_SHIFT_SCORE",
        ),
      },
    },
    warnings: body.lighthouseResult?.runWarnings ?? [],
  };
  summaries.push(summary);
  await writeFile(
    path.join(outputDirectory, `${strategy}-summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

await writeFile(
  path.join(outputDirectory, "summary.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: "google_pagespeed_insights_api_v5",
      targetUrl,
      generatedAt: new Date().toISOString(),
      results: summaries,
    },
    null,
    2,
  )}\n`,
);

for (const result of summaries) {
  process.stdout.write(
    `${result.strategy}: performance ${result.scores.performance}, accessibility ${result.scores.accessibility}, best practices ${result.scores.bestPractices}, SEO ${result.scores.seo}\n`,
  );
}
