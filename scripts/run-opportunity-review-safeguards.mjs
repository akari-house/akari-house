import fs from "node:fs";

const source = fs.readFileSync("app/routes/admin-opportunities.tsx", "utf8");
if (
  source.includes("sectionsJson: string;") &&
  source.includes("Submitted Deal Room sections") &&
  source.includes("AND status IN ('pending', 'approved')")
) {
  console.log("Opportunity review safeguards are already applied.");
} else {
  await import("./patch-opportunity-review-safeguards.mjs");
}
