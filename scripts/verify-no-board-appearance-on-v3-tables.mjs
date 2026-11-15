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

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Skip if not a V3 board context
  const isV3Board = V3_BOARD_PATTERNS.some((p) => p.test(src));
  if (!isV3Board) continue;
  // Check for appearance="board" on PartyTable
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('appearance="board"') && lines[i].includes("PartyTable")) {
      violations.push({ file: file.replace(ROOT + "/", ""), line: i + 1, text: lines[i].trim() });
    }
  }
  // Also check multi-line: PartyTable on one line, appearance="board" near it
  const partyTableIdxs = lines.flatMap((l, i) => (l.includes("<PartyTable") ? [i] : []));
  for (const start of partyTableIdxs) {
    const block = lines.slice(start, start + 5).join(" ");
    if (block.includes('appearance="board"')) {
      const existing = violations.find((v) => v.file === file.replace(ROOT + "/", "") && Math.abs(v.line - (start + 1)) < 5);
      if (!existing) {
        violations.push({ file: file.replace(ROOT + "/", ""), line: start + 1, text: lines[start].trim() });
      }
    }
  }
}

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
