#!/usr/bin/env node
// scripts/gen-program-scoreboard.mjs
//
// Regenerates the Program-module scoreboard data from the committed audit ledger,
// so the board "auto-updates from the repo" (at deploy / CI cadence, not magic realtime).
//
// Pipeline (honest, no fabrication):
//   docs/audit/AUDIT-COVERAGE-LIVE.md  ── (machine check) ──▶  docs/audit/program-scoreboard.json
//        (source of truth: the ledger)          │
//                                               ▼
//   this script  ──▶  apps/frontend/src/pages/program/programScoreboard.data.ts  (typed, imported by the page)
//
// This script does ONE honest thing: it reads the contract JSON and writes the typed .ts.
// It DOES NOT invent verdicts. If the JSON is missing, it fails loudly — never emits a guess.
// The contract JSON is produced by the audit machine check (see Cursor task step 1).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "docs/audit/program-scoreboard.json");
const OUT = path.join(ROOT, "apps/frontend/src/pages/program/programScoreboard.data.ts");

function fail(msg) {
  console.error(`gen-program-scoreboard: ${msg}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(SRC, "utf8"));
} catch (e) {
  fail(
    `missing/unreadable ${path.relative(ROOT, SRC)} — the audit machine check must emit it first ` +
      `(node scripts/audit-coverage-scoreboard.mjs --emit-program-json). Refusing to fabricate a board. (${e.message})`,
  );
}

// Validate the contract so a malformed source can't silently ship a wrong board.
const required = ["meta", "modules", "prod", "chain", "chainMoney", "chainReverse", "guard"];
for (const k of required) {
  if (!(k in data)) fail(`contract JSON missing required key: ${k}`);
}
if (!Array.isArray(data.modules) || data.modules.length === 0) fail("modules[] is empty");
if ("rows" in data) {
  fail(
    "T-05: program-scoreboard.json must not have a `rows` key — the module table is `modules`. Class scoreboard owns `rows` (classScoreboard.data.ts).",
  );
}
const OK = new Set(["PASS", "AUDIT", "FIX", "FAIL", "UNV", "NA"]);
const BOARD_ENTS = ["TRANSP", "USMCA"];
for (const m of data.modules) {
  if (!Array.isArray(m.cells) || m.cells.length !== 13) fail(`module ${m.module}: cells must be length 13`);
  for (const c of m.cells) if (!OK.has(c)) fail(`module ${m.module}: invalid gate state "${c}"`);
  if (!m.cellsByEntity || typeof m.cellsByEntity !== "object") {
    fail(`module ${m.module}: cellsByEntity required (TRANSP + USMCA × 13)`);
  }
  for (const ent of BOARD_ENTS) {
    const arr = m.cellsByEntity[ent];
    if (!Array.isArray(arr) || arr.length !== 13) {
      fail(`module ${m.module}: cellsByEntity.${ent} must be length 13`);
    }
    for (const c of arr) if (!OK.has(c)) fail(`module ${m.module}: cellsByEntity.${ent} invalid "${c}"`);
  }
}

// PROG-PRFEED-PRIVATE-EMPTY: recentActivity is API-served only — never embed in the typecheck seed.
const { recentActivity: _dropFeed, ...seedData } = data;

const header = `// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not hand-edit.
// Produced by scripts/gen-program-scoreboard.mjs from docs/audit/program-scoreboard.json,
// which is emitted by the audit machine check from docs/audit/AUDIT-COVERAGE-LIVE.md.
// Source of truth = the ledger. The board renders truth; it cannot manufacture it.
// ─────────────────────────────────────────────────────────────────────────────

export type GateState = "PASS" | "AUDIT" | "FIX" | "FAIL" | "UNV" | "NA";
export type CellsByEntity = { TRANSP: GateState[]; USMCA: GateState[] };
export interface ModuleRow {
  tier: string;
  module: string;
  build: string;
  /** Worst-of-entities fold (compat / weakest-column tally). */
  cells: GateState[];
  /** B11 — one 13-gate strip per entity (TRANSP + USMCA). */
  cellsByEntity: CellsByEntity;
  gap: string;
}
export interface ProdMetric { n: string; label: string; detail: string; tone?: "good" | "flag" | "zero"; }
export interface ChainNode { title: string; table: string; fk: string; chip: string; chipTone: "prod" | "unv" | "fix" | "fail"; hub?: boolean; branch?: boolean; }
export interface GuardItem { badge: string; tone: "ver" | "pend" | "flag" | "fail"; text: string; }
export interface ProgramScoreboard {
  healthzSha: string;
  generated_at: string;
  meta: { generatedAt: string; sourceSha: string; deployedSha: string; prodReadAt: string; ledgerRows: number; failOpen: number; defects: number; };
  modules: ModuleRow[]; prod: ProdMetric[]; chain: ChainNode[]; chainMoney: string; chainReverse: string; guard: GuardItem[];
  live_scenario_probe?: Record<string, unknown>;
}

export const PROGRAM_SCOREBOARD: ProgramScoreboard = ${JSON.stringify(seedData, null, 2)};
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
try {
  if (fs.readFileSync(OUT, "utf8") === header) {
    console.log(`gen-program-scoreboard: ${path.relative(ROOT, OUT)} unchanged (skip write)`);
    process.exit(0);
  }
} catch {
  /* OUT missing — write below */
}
// Atomic replace — avoids CodeQL js/file-system-race-condition (exists/check then write).
const tmp = `${OUT}.tmp`;
fs.writeFileSync(tmp, header);
fs.renameSync(tmp, OUT);
console.log(`gen-program-scoreboard: wrote ${path.relative(ROOT, OUT)} (${data.modules.length} modules)`);
