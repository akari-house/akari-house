import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const output = join(process.cwd(), "build");
const localSecrets = join(output, "server", ".dev.vars");
if (existsSync(localSecrets)) rmSync(localSecrets, { force: true });

const forbidden = [
  "RESEND_API_KEY=",
  "TURNSTILE_SECRET_KEY=",
  "CLOUDFLARE_API_TOKEN=",
];

const { readdirSync, statSync } = await import("node:fs");
const files = [];
function walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(output);
for (const file of files) {
  const body = readFileSync(file);
  if (body.includes(0)) continue;
  const text = body.toString("utf8");
  const leaked = forbidden.find((needle) => text.includes(needle));
  if (leaked)
    throw new Error(`Build contains forbidden secret marker: ${leaked}`);
}
