#!/usr/bin/env node
/** InlineTrailerPicker — server search (not silent listUnits limit:500). Claim 2148. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inline-trailer-picker-server-search";
const FILE = "apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (/limit:\s*500/.test(code)) problems.push(`${FILE}: must not silent-fetch listUnits(limit:500)`);
  if (!/trailerSearch/.test(code) || !/search:\s*trailerSearch/.test(code)) {
    problems.push(`${FILE}: listUnits must pass search: trailerSearch`);
  }
  if (!/onSearch=\{setTrailerSearch\}/.test(src)) {
    problems.push(`${FILE}: Combobox must wire onSearch={setTrailerSearch}`);
  }
  if (!/trailerSearch\]/.test(code)) {
    problems.push(`${FILE}: trailersQuery key must include trailerSearch`);
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, "SELFTEST FAIL", baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-inline-trl-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/dispatch");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "InlineTrailerPicker.tsx"), `listUnits({ limit: 500 })\nqueryKey: ["dispatch","inline-trailers",id]\n`);
    if (!collectProblems(stubRoot).length) { console.error("planted miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, "FAIL", problems); process.exit(1); }
  console.log(LABEL, "OK");
}
