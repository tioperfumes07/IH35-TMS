import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const srcDir = path.join(root, "apps/backend/src/email/templates");
const destDir = path.join(root, "dist/email/templates");

if (!fs.existsSync(srcDir)) {
  console.warn("[copy-email-templates] Source dir missing, skipping:", srcDir);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const name of fs.readdirSync(srcDir)) {
  if (!name.endsWith(".eta")) continue;
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
}
console.log("[copy-email-templates] Copied .eta templates to", destDir);
