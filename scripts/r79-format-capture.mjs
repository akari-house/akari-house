import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const componentPath = "app/components/ProfileShareCardGlass.tsx";
let component = readFileSync(componentPath, "utf8");
const oldBlock = `  let logo: HTMLImageElement | null = null;
  let flower: HTMLImageElement | null = null;
  try {
    [logo, flower] = await Promise.all([
      loadImage("/assets/brand/akari-logo-horizontal.png"),
      loadImage("/assets/brand/akari-flower-mark.png"),
    ]);
  } catch {
    logo = null;
    flower = null;
  }
`;
const newBlock = `  const [logo, flower] = await Promise.all([
    loadImage("/assets/brand/akari-logo-horizontal.png"),
    loadImage("/assets/brand/akari-flower-mark.png"),
  ]).catch(() => [null, null] as const);
`;
if (!component.includes(oldBlock)) {
  throw new Error("Expected R79 image-loading block was not found.");
}
component = component.replace(oldBlock, newBlock);
writeFileSync(componentPath, component);

const files = [
  "app/components/ProfileShareCard.tsx",
  componentPath,
  "app/styles/r79-profile-sharing-glass.css",
  "tests/unit/profile-card-completion.test.ts",
  "tests/e2e/profile-share-card-glass.spec.ts",
];
execFileSync("npx", ["prettier", "--write", ...files], { stdio: "inherit" });

const payload = Object.fromEntries(
  files.map((path) => [path, readFileSync(path, "utf8")]),
);
writeFileSync(
  "playwright-results.json",
  JSON.stringify({ r79FormattedFiles: payload }),
);
console.error("R79 exact formatter output captured in playwright-results.json.");
process.exit(1);
