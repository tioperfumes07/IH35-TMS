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
  // A COMMENT can say "status/health" as English prose (slash-as-"or") without ever meaning the
  // literal endpoint path — live-caught in verify-transaction-health-computed-not-stored.mjs:12/86
  // ("...status/health column...", a comment about a DB column naming convention, zero relation to
  // any HTTP call). \b/health\b does not require the slash to open a URL — "s" (word) -> "/"
  // (non-word) is itself a \b transition, so prose like that trips the same regex a real bare
  // `fetch("/health")` would. Narrowly excluding comment lines (not weakening the check on real
  // code) fixes this without touching the actual bare-URL detection below, which still fires on
  // every non-comment line.
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) return false;
  // A SOURCE PATH is not an endpoint reference. `apps/backend/src/health/health.routes.ts` contains
  // the substring "/health" and was flagged as a bare URL, which it is not — the backend route file
  // simply lives in a directory called health. A guard that cannot tell a filesystem path from a URL
  // sends authors to obfuscate a correct constant, which is worse than the drift it polices. The real
  // assertion is untouched: every genuine bare /health URL still fails below.
  if (/(?:apps|src)\/[\w./-]*health\//.test(line)) return false;
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
