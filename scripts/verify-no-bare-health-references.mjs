#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = [
  path.join(ROOT, "scripts"),
  path.join(ROOT, "docs", "dr-runbook.md"),
  path.join(ROOT, "docs", "operations"),
  path.join(ROOT, ".github"),
];
const EXTRA_FILES = [path.join(ROOT, "render.yaml"), path.join(ROOT, "scripts", "sync.mjs")];
const EXT = new Set([".mjs", ".md", ".yml", ".yaml"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  if (fs.statSync(dir).isFile()) return [dir];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.includes(" 2.")) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(name))) out.push(full);
  }
  return out;
}

function isBareHealthLine(line) {
  if (!line.includes("/health")) return false;
  if (line.includes("verify-no-bare-health-references")) return false;
  if (/\/api\/v1\//.test(line)) return false;
  if (line.includes("/admin/health")) return false;
  if (/\b\/health\b/.test(line)) return true;
  if (line.includes("/api/" + "health") && !line.includes("/api/v1")) return true;
  if (/ih35dispatch\.com\/health\b/.test(line) || /onrender\.com\/health\b/.test(line)) return true;
  return false;
}

const hits = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      if (isBareHealthLine(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}:${line.trim()}`);
    });
  }
}
for (const file of EXTRA_FILES) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    if (isBareHealthLine(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}:${line.trim()}`);
  });
}

if (hits.length > 0) {
  for (const h of hits) {
    console.error(
      `Found bare /health reference in ${h}. The backend only registers /api/v1/health. Use /api/v1/health.`
    );
  }
  process.exit(1);
}
console.log("verify:no-bare-health-references PASS");
