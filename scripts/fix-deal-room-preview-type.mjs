import fs from "node:fs";

const path = "app/routes/deal-room.tsx";
let source = fs.readFileSync(path, "utf8");
source = source.replace(
  "  founderUsername: string | null;",
  "  founderUsername: string;",
);
source = source.replace(
  "  const safePreview: PreviewRow = {",
  "  const safePreview = {",
);
fs.writeFileSync(path, source);
