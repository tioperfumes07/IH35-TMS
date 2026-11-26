#!/usr/bin/env node
/**
 * GUARD: verify-no-board-appearance-on-v3-tables
 * Prevents regression of #29677: PartyTable appearance="board" (IBM Plex Sans table)
 * must never be used on V3 board pages. V3 boards use appearance="v3".
 *
 * Law: Lead explicit instruction 2026-11-15 21:05Z — "Do not set board on any V3 board table."
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "apps", "frontend", "src");
const LABEL = "verify-no-board-appearance-on-v3-tables";

// Files that render V3 boards — must not use appearance="board" on PartyTable
const V3_BOARD_PATTERNS = [
  /data-v3-board/,
  /partyBoardKit/,
  /PartyBoard/,
  /VendorsHomeBoard/,
  /CustomersListView/,
  /VendorsListView/,
];

function walk(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, results);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) results.push(full);
  }
  return results;
}

/** The violations in one file's source (rel = its path for the report). */
function scanSource(rel, src) {
  const violations = [];
  const isV3Board = V3_BOARD_PATTERNS.some((p) => p.test(src));
  if (!isV3Board) return violations;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('appearance="board"') && lines[i].includes("PartyTable")) violations.push({ file: rel, line: i + 1, text: lines[i].trim() });
  }
  // Also multi-line: PartyTable on one line, appearance="board" within the next 4.
  const partyTableIdxs = lines.flatMap((l, i) => (l.includes("<PartyTable") ? [i] : []));
  for (const start of partyTableIdxs) {
    const block = lines.slice(start, start + 5).join(" ");
    if (block.includes('appearance="board"') && !violations.find((v) => Math.abs(v.line - (start + 1)) < 5)) {
      violations.push({ file: rel, line: start + 1, text: lines[start].trim() });
    }
  }
  return violations;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["one-line board table on a V3 board", "// data-v3-board\n<PartyTable appearance=\"board\" rows={r} />", 1],
    ["multi-line board table in a PartyBoard", "import { PartyBoard } from 'x';\n<PartyTable\n  rows={r}\n  appearance=\"board\"\n/>", 1],
    ["v3 appearance is fine", "// data-v3-board\n<PartyTable appearance=\"v3\" rows={r} />", 0],
    ["board appearance outside a V3 board is not this guard's business", "<PartyTable appearance=\"board\" rows={r} />", 0],
  ];
  let ok = 0;
  for (const [name, src, want] of cases) {
    const got = scanSource("fixture.tsx", src).length;
    if (got === want) ok++; else console.error(`SELFTEST MISSED: ${name} (expected ${want}, got ${got})`);
  }
  const live = walk(SRC).flatMap((f) => scanSource(f.replace(ROOT + "/", ""), readFileSync(f, "utf8"))).length;
  if (live) console.error(`SELFTEST: the live tree has ${live} violation(s)`);
  console.log(`${LABEL} SELFTEST: ${ok}/${cases.length} planted cases judged right${live ? " (live tree red)" : ""}`);
  process.exit(ok === cases.length && live === 0 ? 0 : 1);
}

const files = walk(SRC);
const violations = files.flatMap((f) => scanSource(f.replace(ROOT + "/", ""), readFileSync(f, "utf8")));

if (violations.length > 0) {
  console.error(`${LABEL}: FAIL — ${violations.length} violation(s): appearance="board" on PartyTable inside a V3 board context`);
  console.error("Law: V3 board tables must use appearance=\"v3\", not \"board\" (IBM Plex Sans). See Lead instruction 2026-11-15.");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  process.exit(1);
}

console.log(`${LABEL}: PASS — no appearance="board" on PartyTable in V3 board contexts (${files.length} files scanned)`);
process.exit(0);
