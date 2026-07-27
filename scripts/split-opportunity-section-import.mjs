import fs from "node:fs";

const path = "app/routes/opportunity-manage.tsx";
let source = fs.readFileSync(path, "utf8");
source = source.replace(
  `import {\n  loadOpportunitySections,\n  opportunitySectionDefinitions,\n  saveOpportunitySections,\n} from "~/lib/opportunity-sections.server";`,
  `import { opportunitySectionDefinitions } from "~/lib/opportunity-sections";\nimport {\n  loadOpportunitySections,\n  saveOpportunitySections,\n} from "~/lib/opportunity-sections.server";`,
);
fs.writeFileSync(path, source);
