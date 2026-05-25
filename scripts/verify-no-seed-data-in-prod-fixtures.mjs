#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const backendRoot = path.join(ROOT, "apps/backend/src");

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const forbidden = ["tests/fixtures", "scripts/seed"];
const violations = [];
for (const file of walk(backendRoot)) {
  const source = fs.readFileSync(file, "utf8");
  for (const marker of forbidden) {
    if (source.includes(marker)) {
      violations.push(`${path.relative(ROOT, file)} imports forbidden fixture path containing "${marker}"`);
    }
  }
}

if (violations.length > 0) {
  console.error("verify:no-seed-data-in-prod-fixtures failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log("verify:no-seed-data-in-prod-fixtures: ok");
