#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = [
  "apps/backend/src/mdata",
  "apps/backend/src/maintenance",
  "apps/backend/src/accounting",
  "apps/backend/src/banking",
  "apps/backend/src/telematics",
  "apps/backend/src/driver-finance",
].map((p) => path.join(ROOT, p));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const offenders = [];
const files = SCAN_ROOTS.flatMap((dir) => walk(dir));
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("withCurrentUser")) continue;
  if (!/\.query\s*\([\s\S]{0,800}?\)\s*\.catch\s*\(/.test(src)) continue;
  const rel = path.relative(ROOT, file);
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(".catch(")) continue;
    if (/ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT/.test(line)) continue;
    const window = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
    if (/\.query\s*\(/.test(window) && !/withSavepoint\s*\(/.test(window)) {
      offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  }
}

if (offenders.length > 0) {
  console.error("verify:aggregate-savepoints FAIL — client.query().catch() inside withCurrentUser files without withSavepoint:");
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}

console.log("verify:aggregate-savepoints PASS");
