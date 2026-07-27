import fs from "node:fs";

const path = "app/routes/deals.tsx";
let source = fs.readFileSync(path, "utf8");
source = source
  .replaceAll("1–5 million", "1 to 5 million")
  .replaceAll("25,000–100,000", "25,000 to 100,000")
  .replaceAll('range.join(" – ")', 'range.join(" to ")');
fs.writeFileSync(path, source);
