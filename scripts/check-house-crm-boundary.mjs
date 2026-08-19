import { readFileSync } from "node:fs";

const failures = [];
const read = (path) => readFileSync(path, "utf8");

const routes = read("app/routes.ts");
for (const route of [
  "admin/agreements",
  "admin/relationships",
  "admin/operating-rhythm",
  "admin/finance",
  "admin/workspaces",
  "workspace-invitations/accept",
]) {
  if (routes.includes(route)) failures.push(`retired House route returned: ${route}`);
}

const auth = read("app/lib/auth.server.ts");
if (/Domain\s*=\s*\.?akarihouse\.com/i.test(auth))
  failures.push("House session cookie is scoped across AKARI subdomains");

const email = read("app/lib/email.server.ts");
if (email.includes("workspace-invitations/accept"))
  failures.push("dead SaaS workspace invitation route remains in House email code");

const login = read("app/routes/login.tsx");
if (login.includes("workspace-invitations/accept"))
  failures.push("dead SaaS workspace invitation compatibility remains in House login");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("House / CRM product boundary check passed.");
