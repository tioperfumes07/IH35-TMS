#!/usr/bin/env node
/**
 * GUARD: a query that excludes voided bills must test revoked_at, not voided_at alone. ACCT-F202.
 *
 * THE SPLIT. accounting.bills carries BOTH columns, and they are written by different things:
 *   · revoked_at  — what voidBill() actually sets (bills.service.ts, alongside revoked_by_user_id
 *                   and revoked_reason). This is the ONLY void column any application code writes.
 *   · voided_at   — written by NO application code at all. Verified by grep across apps/backend/src
 *                   and confirmed on prod: 4 bills carry it from an out-of-band write, while the 2
 *                   bills voided through the real path carry revoked_at and leave voided_at NULL.
 *
 * SO `WHERE b.voided_at IS NULL` MATCHES EVERY PROPERLY-VOIDED BILL. It reads like an exclusion and
 * excludes nothing. Two live sites had it:
 *   · the duplicate bill-number check, whose own comment promised "voided bills never collide" while
 *     doing the opposite — a voided bill kept blocking re-entry of its number, which is exactly what
 *     re-entering a voided bill is for;
 *   · the TMS-native bill count on the scenario registry, which counted voided bills as live.
 *
 * WHY BOTH COLUMNS RATHER THAN A SWAP. Swapping to revoked_at alone would leave the 4 out-of-band
 * rows counted as live. Both are tested so the predicate is correct under either provenance, and it
 * does not depend on the status vocabulary (prod uses 'void'; 'voided' also appears in this codebase
 * for other tables).
 *
 * WHAT THIS DELIBERATELY DOES NOT FLAG: `voided_at` on any OTHER table. accounting.expenses,
 * accounting.payments and accounting.vendor_credits genuinely use voided_at and are correct; only
 * accounting.bills has the split. An earlier sweep of this file nearly rewrote
 * revenue-leakage.service.ts, where the alias `b` is bound to
 * accounting.load_revenue_recognition_postings — the check is therefore anchored to the FROM/JOIN
 * that actually binds the alias, not to the alias letter.
 *
 * Run:  node scripts/verify-bills-void-filter-uses-revoked-at.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-bills-void-filter-uses-revoked-at";

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Aliases bound to accounting.bills by a FROM or JOIN. Returns a Set of alias identifiers, plus the
 * bare table name so unaliased `accounting.bills.voided_at` references are covered too.
 */
export function billsAliases(src) {
  const clean = stripComments(src);
  const aliases = new Set(["accounting.bills"]);
  const re = /\b(?:FROM|JOIN)\s+accounting\.bills\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const alias = m[1];
    if (!/^(where|on|set|using|left|right|inner|outer|cross|join|group|order|limit)$/i.test(alias)) {
      aliases.add(alias);
    }
  }
  return aliases;
}

/**
 * A filter on <billsAlias>.voided_at that is NOT accompanied by a revoked_at test in the same
 * statement window. The window is generous (1200 chars) because these predicates are multi-line.
 */
export function offendingFilters(src) {
  const clean = stripComments(src);
  const aliases = billsAliases(clean);
  if (aliases.size <= 1 && !/accounting\.bills/i.test(clean)) return [];
  const problems = [];
  for (const alias of aliases) {
    const esc = alias.replace(".", "\\.");
    const re = new RegExp(`\\b${esc}\\.voided_at\\b`, "gi");
    let m;
    while ((m = re.exec(clean)) !== null) {
      const window = clean.slice(Math.max(0, m.index - 600), m.index + 600);
      if (!/\brevoked_at\b/i.test(window)) problems.push(`${alias}.voided_at`);
    }
  }
  return problems;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

export function collectProblems(sources) {
  const problems = [];
  for (const { file, src } of sources) {
    for (const hit of offendingFilters(src)) {
      problems.push(
        `${file}: filters ${hit} without also testing revoked_at. voidBill() writes revoked_at and ` +
          `never voided_at, so this predicate matches EVERY properly-voided bill — it reads like an ` +
          `exclusion and excludes nothing (ACCT-F202).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = "SELECT 1 FROM accounting.bills b WHERE b.voided_at IS NULL AND b.bill_number = $1";
  if (offendingFilters(bad).length !== 1) failures.push("the ACCT-F202 predicate verbatim was NOT caught");

  const good =
    "SELECT 1 FROM accounting.bills b WHERE b.revoked_at IS NULL AND b.voided_at IS NULL AND b.bill_number = $1";
  if (offendingFilters(good).length !== 0) failures.push("the corrected both-column predicate was flagged");

  // THE FALSE POSITIVE THIS GUARD EXISTS TO AVOID: alias `b` bound to a DIFFERENT table.
  const otherTable =
    "SELECT 1 FROM accounting.load_revenue_recognition_postings b WHERE b.event='bill' AND b.voided_at IS NULL";
  if (offendingFilters(otherTable).length !== 0) {
    failures.push("an alias bound to a DIFFERENT table was flagged — the near-miss rewrite");
  }

  // Other tables legitimately use voided_at and must never be flagged.
  const expenses = "SELECT 1 FROM accounting.expenses e WHERE e.voided_at IS NULL";
  if (offendingFilters(expenses).length !== 0) failures.push("accounting.expenses was flagged");

  // A comment mentioning revoked_at must not satisfy the check.
  const commentOnly =
    "-- revoked_at is the real column\nSELECT 1 FROM accounting.bills b WHERE b.voided_at IS NULL";
  if (offendingFilters(commentOnly).length !== 1) {
    failures.push("a COMMENT naming revoked_at satisfied the check — false green");
  }

  // JOIN binding and AS-alias forms must both resolve.
  const joined = "SELECT 1 FROM x JOIN accounting.bills AS bb ON bb.id=x.id WHERE bb.voided_at IS NULL";
  if (offendingFilters(joined).length !== 1) failures.push("a JOIN ... AS alias was NOT resolved");

  if (collectProblems([{ file: "x.ts", src: bad }]).length !== 1) {
    failures.push("collectProblems did not surface the predicate");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 7/7 (defect caught, both-column fix passes, other-table alias NOT flagged, ` +
      `expenses ignored, comment cannot fake a pass, JOIN/AS alias resolved, end-to-end)`
  );
  process.exit(0);
}

const sources = fs.existsSync(SRC)
  ? walk(SRC).map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }))
  : [];
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} bill-void filter(s) testing the wrong column:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — every accounting.bills void filter tests revoked_at (${sources.length} files scanned).`
);
