import fs from "node:fs";

const path = "app/routes/saas-workspace.tsx";
let text = fs.readFileSync(path, "utf8");
const oldMeta = `export const meta: Route.MetaFunction = ({ data }) => [
  {
    title: data
      ? \`${"${data.workspace.name}"} Workspace | AKARI\`
      : "Workspace | AKARI",
  },
  {
    name: "description",
    content:
      "Private AKARI workspace for team, modules, linked Projects and commercial status.",
  },
];`;
const newMeta = `export const meta: Route.MetaFunction = () => [
  { title: "Private Workspace | AKARI" },
  {
    name: "description",
    content:
      "Private AKARI workspace for team, modules, linked Projects and commercial status.",
  },
];`;
if (text.includes(oldMeta)) text = text.replace(oldMeta, newMeta);
else if (!text.includes('title: "Private Workspace | AKARI"'))
  throw new Error("R75 workspace meta marker missing");
fs.writeFileSync(path, text);
