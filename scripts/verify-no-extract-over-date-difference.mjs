#!/usr/bin/env node
/**
 * LV-001 — EXTRACT() must never wrap a DATE minus DATE subtraction.
 *
 * In PostgreSQL `date - date` yields an INTEGER day count, NOT an interval. Wrapping that in
 * EXTRACT(...) raises 42883 "function pg_catalog.extract(unknown, integer) does not exist" and
 * 500s the whole request at runtime — it is not caught by tsc, by vitest, or by any type check,
 * because the SQL is a template string.
 *
 * LIVE DEFECT THIS GUARD LOCKS OUT (prod, 2026-08-04):
 *   GET /api/v1/customers/:uuid/relationship-score returned HTTP 500
 *   {"code":"42883","message":"function pg_catalog.extract(unknown, integer) does not exist"}
 *   for EVERY customer in BOTH entities. Source: scorer.service.ts
 *     GREATEST(EXTRACT(DAY FROM (current_date - i.issue_date)), 0)
 *   Neon prod (br-fancy-credit-akjnd07a): accounting.invoices.issue_date is DATE, and
 *   master_data.customer_relationship_scores had n_tup_ins=0 — the upsert had NEVER once
 *   succeeded, confirming the query threw on every call since it shipped.
 *
 * SCOPE: flags EXTRACT(<field> FROM <expr>) only when <expr> subtracts one date-typed operand
 * from another (current_date, or an identifier ending in _date). It deliberately does NOT flag:
 *   - EXTRACT(YEAR FROM COALESCE(m.txn_date, CURRENT_DATE))  → extracting from a date, valid
 *   - EXTRACT(EPOCH FROM (now() - x))                        → timestamptz difference = interval, valid
 *
 *   node scripts/verify-no-extract-over-date-difference.mjs
 *   node scripts/verify-no-extract-over-date-difference.mjs --selftest
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-no-extract-over-date-difference";
const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];
const FIXED_FILE = "apps/backend/src/customers/relationship-score/scorer.service.ts";

// Both sides of the subtraction must be date-typed for the result to be INTEGER.
const DATE_OPERAND = String.raw`(?:current_date|[a-z_][\w.]*_date)`;
const DATE_MINUS_DATE = new RegExp(`\\b${DATE_OPERAND}\\b\\s*-\\s*\\b${DATE_OPERAND}\\b`, "i");

/** Return every EXTRACT(...) span with balanced parens, plus its FROM-operand. */
function extractSpans(text) {
  const spans = [];
  const re = /\bEXTRACT\s*\(/gi;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
    }
    if (depth !== 0) continue; // unbalanced (template interpolation) — skip rather than guess
    const inner = text.slice(m.index + m[0].length, i - 1);
    const fromIdx = inner.search(/\bFROM\b/i);
    if (fromIdx === -1) continue;
    spans.push({
      index: m.index,
      operand: inner.slice(fromIdx + 4),
      whole: text.slice(m.index, i),
    });
  }
  return spans;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (e === "node_modules" || e === "dist" || e === ".git") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs|js|sql)$/.test(e)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A test that PROVES the defect still throws must be allowed to contain the defective SQL as a
 * negative control. That exemption is deliberately narrow and needs BOTH conditions, so it can
 * never quietly cover product code:
 *   1. the file is a test file (__tests__/ or *.test.ts), AND
 *   2. the offending line (or the line above it) carries the explicit marker below.
 * A marker in a product file does NOT suppress the finding — asserted in the selftest.
 */
const NEGATIVE_CONTROL_MARKER = "guard-allow:extract-date-diff-negative-control";

function isTestPath(rel) {
  return /(^|\/)__tests__\//.test(rel) || /\.test\.[cm]?tsx?$/.test(rel);
}

const MARKER_LOOKBACK_LINES = 8;

function isExemptOccurrence(rel, text, index) {
  if (!isTestPath(rel)) return false;
  const lineNo = text.slice(0, index).split("\n").length; // 1-based line of the occurrence
  const all = text.split("\n");
  const from = Math.max(0, lineNo - 1 - MARKER_LOOKBACK_LINES);
  return all
    .slice(from, lineNo)
    .some((l) => l.includes(NEGATIVE_CONTROL_MARKER));
}

function assertText(rel, text) {
  const problems = [];
  for (const span of extractSpans(text)) {
    if (DATE_MINUS_DATE.test(span.operand)) {
      if (isExemptOccurrence(rel, text, span.index)) continue;
      const line = text.slice(0, span.index).split("\n").length;
      problems.push(
        `${rel}:${line}: EXTRACT() wraps a DATE-minus-DATE subtraction — that operand is INTEGER, ` +
          `so this throws Postgres 42883 at runtime. Use the subtraction directly ` +
          `(e.g. GREATEST(current_date - some_date, 0)). Offending: ${span.whole.replace(/\s+/g, " ").slice(0, 120)}`,
      );
    }
  }
  return problems;
}

function scanRepo() {
  const problems = [];
  for (const rootRel of SCAN_ROOTS) {
    for (const abs of walk(path.join(ROOT, rootRel))) {
      const rel = path.relative(ROOT, abs);
      problems.push(...assertText(rel, readFileSync(abs, "utf8")));
    }
  }
  return problems;
}

if (SELFTEST) {
  const failures = [];

  // 1. The exact pre-fix defect MUST be caught.
  const planted = `
    SELECT COALESCE(SUM(
      GREATEST(EXTRACT(DAY FROM (current_date - i.issue_date)), 0) * i.amount_open_cents
    ), 0) FROM accounting.invoices i
  `;
  if (!assertText("planted.ts", planted).length) {
    failures.push("planted pre-fix EXTRACT(DAY FROM (current_date - i.issue_date)) was NOT caught");
  }

  // 2. The shipped fix MUST NOT be flagged.
  const fixed = `GREATEST(current_date - i.issue_date, 0) * i.amount_open_cents`;
  if (assertText("fixed.ts", fixed).length) {
    failures.push("the corrected date-difference form was wrongly flagged");
  }

  // 3. Legitimate EXTRACT forms MUST NOT be flagged (guard must not fail closed on valid SQL).
  const legit = [
    `EXTRACT(YEAR FROM COALESCE(m.txn_date, CURRENT_DATE))::int AS yr`,
    `EXTRACT(EPOCH FROM (now() - started_at))`,
    `EXTRACT(MONTH FROM i.issue_date)`,
  ];
  for (const ok of legit) {
    if (assertText("legit.ts", ok).length) failures.push(`legitimate SQL wrongly flagged: ${ok}`);
  }

  // 4. The real source file must currently be clean (proves the fix is actually in the tree).
  const realSrc = readFileSync(path.join(ROOT, FIXED_FILE), "utf8");
  if (assertText(FIXED_FILE, realSrc).length) {
    failures.push(`${FIXED_FILE} still contains the defect`);
  }

  // 5. Negative-control exemption must be NARROW: test file + explicit marker only.
  const defect = `EXTRACT(DAY FROM (current_date - i.issue_date))`;
  const markered = `// ${NEGATIVE_CONTROL_MARKER}\n${defect}`;
  // 5a. marker in a TEST file suppresses (that is the whole point)
  if (assertText("apps/backend/src/x/__tests__/a.db.test.ts", markered).length) {
    failures.push("marker in a test file failed to exempt the negative control");
  }
  // 5b. marker in a PRODUCT file must NOT suppress — the exemption must never cover product SQL
  if (!assertText("apps/backend/src/x/scorer.service.ts", markered).length) {
    failures.push("marker wrongly suppressed the defect in a PRODUCT file — exemption is too wide");
  }
  // 5c. a test file WITHOUT the marker is still flagged (no blanket test-directory blind spot)
  if (!assertText("apps/backend/src/x/__tests__/a.db.test.ts", defect).length) {
    failures.push("unmarked defect in a test file was not flagged — test dirs must not be a blind spot");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — defect caught, fix accepted, 3 legitimate EXTRACT forms not flagged`);
  process.exit(0);
}

const problems = scanRepo();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — no EXTRACT() wraps a DATE-minus-DATE subtraction (LV-001 / Postgres 42883 locked out)`,
);
process.exit(0);
