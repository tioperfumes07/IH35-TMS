#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATTERNS = [/ 2\.sql$/i, / 2\.mjs$/i, / 2\.ts$/i, / 2\.tsx$/i];
const ROOTS = [
  path.join(ROOT, "db", "migrations"),
  path.join(ROOT, "scripts"),
  path.join(ROOT, "apps"),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const base = path.basename(file);
    if (PATTERNS.some((re) => re.test(base))) hits.push(path.relative(ROOT, file));
  }
}

if (hits.length > 0) {
  for (const p of hits) {
    console.error(`Found macOS-style duplicate: ${p}. These are accidental Finder duplicates. Delete the file.`);
  }
  process.exit(1);
}
console.log("verify:no-spurious-duplicates PASS");
