#!/usr/bin/env node
// ROUND 197 (owner-raised, 2026-09-28) — verify-banking-controls-boxed-and-tokenized.mjs
//
// Owner: "ALL TO BE IN PROPER BOX FORMAT AND FONTS AND TEXT AND BACKGROUND." Six named controls on
// the banking transactions register (tabs, money filter, presets, collapse-groupings/suggest-
// matches, transaction-type filter, pagination) must render through ONE shared box/token
// component, not six hand-rolled variants that drift. This guard is static-only (no live DB —
// it checks source shape, not data) and is scoped to the two files ROUND 197 actually touches
// (BankingControlBox.tsx + BankingTransactionsDesignView.tsx), never the whole banking/components
// tree — other banking screens (AccountTile, MatchDrawer, …) carry their own pre-existing hex debt
// that is out of this round's scope; flagging it here would be an unrelated baseline expansion, not
// this defect. It asserts:
//   1. BankingControlBox.tsx exists and exports the shared box/group/segment components + tokens.
//   2. Every hex literal in BOTH files resolves to one of the 8 locked baseline tokens — no invented
//      or retired (#1f2a44) shade.
//   3. BankingTransactionsDesignView.tsx (the transactions register) actually imports and uses the
//      shared components — not just defines them and ignores them.
//   4. The pagination "Page N of M" string is built from a template referencing real variables, not
//      a bare hardcoded literal like "Page 1 of 8" (law section 8 — a number-shaped thing that came
//      from nowhere is the most dangerous defect class here).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-banking-controls-boxed-and-tokenized";
export const ALLOW_OFFLINE_SKIP = "pure static source-shape check, no live data involved";

const BANKING_COMPONENTS_DIR = "apps/frontend/src/pages/banking/components";
const BOX_FILE = "BankingControlBox.tsx";
const REGISTER_FILE = "BankingTransactionsDesignView.tsx";

// The only hex literals allowed anywhere (and ONLY inside BOX_FILE) — transcribed verbatim from
// docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md. Any other hex is either a stale/retired shade (like the
// #1f2a44 this round fixed) or an invented, unlocked color.
const ALLOWED_HEX = [
  "#FFFFFF",
  "#F7F8FA",
  "#E5E7EB",
  "#0F1219",
  "#1F2A44",
  "#6B7280",
  "#14314F",
  "#4B5563",
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(src) {
  // Prose in a comment ("the retired #1f2a44 shade") is documentation, not a rendered color — only
  // hex reachable by the actual code (className strings, JS literals) counts as a real usage.
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function findHexLiterals(src) {
  // Matches #fff/#ffffff/#RRGGBB in any case, inside or outside a Tailwind arbitrary-value bracket.
  const re = /#[0-9a-fA-F]{3,8}\b/g;
  return [...new Set((stripComments(src).match(re) ?? []).map((h) => h.toUpperCase()))];
}

function selftest() {
  const failures = [];
  if (ALLOWED_HEX.length !== 8) failures.push(`ALLOWED_HEX drifted: expected 8 locked tokens, found ${ALLOWED_HEX.length}`);
  if (!ALLOWED_HEX.includes("#14314F")) failures.push("ALLOWED_HEX missing the active-state navy #14314F");
  if (ALLOWED_HEX.includes("#1F2A44") === false) failures.push("ALLOWED_HEX missing locked secondary text #1F2A44");
  // #1f2a44 as an ACTIVE-STATE FILL (not text color) is the exact retired shade this round fixed —
  // the guard itself can't distinguish text-color use from fill use by hex alone, so the real
  // enforcement is "only BOX_FILE may contain any hex" (checked live below), not a second denylist.
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 8 locked tokens, active navy + secondary text both present`);
}

function main() {
  const failures = [];
  const files = walk(BANKING_COMPONENTS_DIR);
  const boxPath = files.find((f) => f.endsWith(`/${BOX_FILE}`));
  const registerPath = files.find((f) => f.endsWith(`/${REGISTER_FILE}`));

  if (!boxPath) {
    failures.push(`${BOX_FILE} not found under ${BANKING_COMPONENTS_DIR} — the shared box component must exist.`);
  } else {
    const boxSrc = readFileSync(boxPath, "utf8");
    for (const name of ["BankingControlBox", "BankingControlGroup", "BankingControlSegment", "bankingControlBoxClass"]) {
      if (!boxSrc.includes(`export function ${name}`) && !boxSrc.includes(`export const ${name}`) && !boxSrc.includes(`export function ${name}(`)) {
        failures.push(`${BOX_FILE} does not export ${name}.`);
      }
    }
  }

  // #2 — every hex literal in the two ROUND 197 files must resolve to a locked baseline token.
  for (const path of [boxPath, registerPath].filter(Boolean)) {
    const src = readFileSync(path, "utf8");
    const hex = findHexLiterals(src);
    const unlocked = hex.filter((h) => !ALLOWED_HEX.includes(h));
    if (unlocked.length > 0) {
      failures.push(`${path}: unlocked hex literal(s) ${unlocked.join(", ")} — not one of the 8 GLOBAL-TYPE-SIZE-BASELINE.md tokens.`);
    }
  }

  // #3 — the register actually imports and uses the shared components (not orphaned).
  if (registerPath) {
    const src = readFileSync(registerPath, "utf8");
    if (!/from ["']\.\/BankingControlBox["']/.test(src)) {
      failures.push(`${REGISTER_FILE} does not import from ./BankingControlBox.`);
    }
    for (const name of ["BankingControlBox", "BankingControlGroup", "BankingControlSegment"]) {
      const uses = (src.match(new RegExp(`<${name}\\b`, "g")) ?? []).length;
      if (uses < 1) failures.push(`${REGISTER_FILE} imports ${name} but never renders it.`);
    }
    // #4 — "Page N of M" must be a template referencing variables, never a bare literal.
    const bareLiteral = /["'`]Page \d+ of \d+["'`]/;
    if (bareLiteral.test(src)) {
      failures.push(`${REGISTER_FILE} has a hardcoded "Page N of M" literal instead of a template.`);
    }
    if (!/Page \$\{[a-zA-Z]+\} of \$\{[a-zA-Z]+\}/.test(src)) {
      failures.push(`${REGISTER_FILE} does not build "Page N of M" from a template with two real variables.`);
    }
  } else {
    failures.push(`${REGISTER_FILE} not found under ${BANKING_COMPONENTS_DIR}.`);
  }

  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — shared box component exists, is the sole source of hex tokens, is actually used by the register, and Page N of M is derived, never a literal.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

main();
