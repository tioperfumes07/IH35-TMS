#!/usr/bin/env node
/**
 * T-08 first ratchet — never pin a date-only calendar day to noon at a hardcoded CST/CDT offset.
 *
 * `T12:00:00-05:00` is CDT-only. In CST the same noon is `-06:00`. DST must use IANA
 * America/Chicago (see apps/frontend/src/lib/businessDate.ts). Date-only values should be
 * rendered from YYYY-MM-DD parts, not as instants.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ct-timezone-rendering";
const DIR = "apps/frontend/src";
const OFFSET_NOON_RE = /T12:00:00-0[56]:00/;

export function auditSource(src) {
  const hits = [];
  src.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    if (OFFSET_NOON_RE.test(line)) hits.push({ line: i + 1, text: trimmed.slice(0, 120) });
  });
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const bad = 'const d = new Date(raw.length <= 10 ? `${raw}T12:00:00-05:00` : raw);';
  const badCst = 'Date.parse(`${raw}T12:00:00-06:00`)';
  const good = 'if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) { const [y, m, d] = raw.split("-"); }';
  const comment = "// T12:00:00-05:00 is the T-08 defect";
  const cases = [
    ["CDT noon pin", bad, 1],
    ["CST noon pin", badCst, 1],
    ["calendar parts", good, 0],
    ["comment", comment, 0],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = auditSource(src).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases`);
  process.exit(0);
}

const abs = path.join(ROOT, DIR);
const files = walk(abs);
if (files.length === 0) {
  console.error(`${LABEL} FAIL — scanned ZERO files under ${DIR}`);
  process.exit(1);
}

const problems = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  for (const h of auditSource(fs.readFileSync(f, "utf8"))) {
    problems.push(`${rel}:${h.line}: ${h.text}`);
  }
}

if (problems.length) {
  console.error(
    `${LABEL} FAIL — date-only values pinned to noon at a hardcoded UTC offset (DST-unsafe):\n`,
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nFix: render YYYY-MM-DD from calendar parts, or format instants via formatInCompanyTimeZone / CENTRAL_TIME_ZONE (America/Chicago).\n`,
  );
  process.exit(1);
}

console.log(`${LABEL} OK — ${files.length} frontend src file(s), no T12:00:00-05/06:00 pins.`);
process.exit(0);
