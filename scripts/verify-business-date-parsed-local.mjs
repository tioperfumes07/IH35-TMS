#!/usr/bin/env node
/**
 * GUARD — a business date (`YYYY-MM-DD`) must never be parsed as UTC for display.
 *
 * THE DEFECT, reproduced live on prod (deploy 308bc66, /cash-flow, USMCA): the 7-day outlook strip
 * labelled every cell ONE DAY EARLY while its click handler used the true date. Clicking the cell
 * marked "Fri 8/7" selected **Sat, Aug 8**; clicking "Sun 8/9" selected **Mon, Aug 10** — reproducible,
 * always +1. An operator checking Friday's cash position was shown Saturday's.
 *
 * WHY: a business date has no timezone — it is the company's calendar day. `new Date("2026-08-08" +
 * "T00:00:00Z")` pins it to UTC midnight, and `toLocaleDateString()` then renders it in the viewer's
 * zone, shifting it back a day for everyone west of UTC. IH35 operates in Central Time (UTC-5/-6), so
 * the shift is permanent, not an edge case. The same file already had the CORRECT construction in its
 * `fmtDate` header helper — the two disagreed, which is exactly why the click and the label diverged.
 *
 * WHAT IT ASSERTS: no `new Date(<something> + "T00:00:00Z")` inside apps/frontend/src/pages/cash-flow.
 * Scoped to that module deliberately: the pattern is legitimate elsewhere when a true UTC instant is
 * intended, and a repo-wide ban would be wrong. This is the surface where the business-date meaning is
 * load-bearing and where it demonstrably broke.
 *
 * NOT CLAIMED: it does not prove every date on the page is correct, only that the specific
 * UTC-pinning construction that caused the off-by-one is not present.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-business-date-parsed-local";
const DIR = "apps/frontend/src/pages/cash-flow";

/** `new Date(anything + "T00:00:00Z")` — the UTC-pinning parse of a business date. */
const UTC_PIN_RE = /new\s+Date\s*\(\s*[^)]*\+\s*["'`]T00:00:00Z["'`]\s*\)/;

export function auditSource(src) {
  const hits = [];
  src.split("\n").forEach((line, i) => {
    // A line that is purely a comment is documentation (including this guard's own explanation of the
    // pattern) and must not be flagged — otherwise the fix's own comment fails the guard.
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    if (UTC_PIN_RE.test(line)) hits.push({ line: i + 1, text: trimmed.slice(0, 110) });
  });
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const bad = `const d = new Date(entry.date + "T00:00:00Z").toLocaleDateString("en-US");`;
  const good = `const d = localDateFromIso(entry.date).toLocaleDateString("en-US");`;
  const commentOnly = ` * it as \`new Date(iso + "T00:00:00Z")\` pins it to UTC midnight, and rendering that`;
  const slashComment = `// new Date(iso + "T00:00:00Z") is the bug`;
  const cases = [
    ["the shipped defect", bad, 1],
    ["the fixed form", good, 0],
    ["a JSDoc line describing the pattern", commentOnly, 0],
    ["a // comment describing the pattern", slashComment, 0],
    ["both a real hit and a comment", bad + "\n" + commentOnly, 1],
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
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases (including comment false-positives)`);
  process.exit(0);
}

const abs = path.join(ROOT, DIR);
const files = walk(abs);
if (files.length === 0) {
  console.error(`${LABEL} FAIL — scanned ZERO files under ${DIR}; scope is wrong, refusing to pass vacuously.`);
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
    `${LABEL} FAIL — a business date is parsed as UTC and will render one day early in Central Time:\n`,
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nFix: parse the parts as a LOCAL date (see localDateFromIso in ` +
      `pages/cash-flow/tabs/DailyPredictionTab.tsx). A business date has no timezone.\n`,
  );
  process.exit(1);
}

console.log(`${LABEL} OK — ${files.length} cash-flow file(s), no business date pinned to UTC for display.`);
process.exit(0);
