#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const TARGET_RE = /qbo_archive\.entities_snapshot/i;
const SOURCE_EXT_RE = /\.(tsx|jsx|ts|js)$/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && SOURCE_EXT_RE.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

const violations = [];
for (const filePath of walk(FRONTEND_ROOT)) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!TARGET_RE.test(lines[index])) continue;
    violations.push(`${path.relative(ROOT, filePath)}:${index + 1} contains qbo_archive.entities_snapshot`);
  }
}

if (violations.length > 0) {
  console.error("verify:tail-cosmetic-no-internal-string failed");
  for (const violation of violations) console.error(violation);
  process.exit(1);
}

console.log("verify:tail-cosmetic-no-internal-string: ok");
