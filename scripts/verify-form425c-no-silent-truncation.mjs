#!/usr/bin/env node
/**
 * CLS-SILENT-SUCCESS (court lane) — Form 425-C exhibits must never silently truncate or
 * silently blank a schedule that is filed with the bankruptcy court.
 *
 * RATCHETING CLASS GUARD: it scans EVERY file under apps/backend/src/reports/form-425c/ and
 * fails on ANY remaining offender of either shape, so a new exhibit cannot reintroduce the class.
 *
 * Two banned shapes:
 *   1. `LIMIT <n>` inside an exhibit SQL query. A supporting-documents schedule that stops at N
 *      rows omits records without saying so, and the exhibit's own document_count then reports the
 *      truncated length as if it were the true count. Measured on prod 2026-07-31: 22 bill-months
 *      and 29 invoice-months exceeded the old LIMIT 200 (worst 342 bills / 345 invoices) —
 *      3,031 documents would have been dropped from filings with no marker.
 *   2. `.catch(() => <fabricated default>)` on an exhibit query. A failed query then renders as an
 *      empty/zero exhibit, which is how Exhibit F filed ZERO supporting documents against 28,213
 *      real records.
 *
 * Comments are stripped before auditing: a guard that scans raw text flags its own explanatory
 * notes (the failure mode hit in PR #3921, where a guard reported its own fix comment as a defect).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-form425c-no-silent-truncation";
const SCAN_DIR = join(ROOT, "apps/backend/src/reports/form-425c");

/** Remove block and line comments so the guard never audits its own prose. */
export function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip `//` line comments, but not the `//` inside a URL (`https://…`).
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return out;
}

/**
 * [start, end) spans of every `LATERAL (...)` subquery body in `src` (paren-balanced).
 *
 * A `LIMIT 1` inside a LATERAL subquery — paired with an ORDER BY, as in
 * `LEFT JOIN LATERAL (SELECT … ORDER BY … LIMIT 1) x ON TRUE` — is the standard "pick exactly one
 * canonical row per OUTER row" SQL idiom (e.g. exhibit-c-bank-reconciliation.ts picking the one
 * reconciliation session that backs an account's opening balance). It can never drop a row from the
 * exhibit's own result set — only select which single record backs one field on one row that was
 * already going to be included. That is a different shape from the banned one: a LIMIT on the
 * exhibit's own top-level row list, which silently omits records from the filed schedule.
 */
function lateralSpans(src) {
  const spans = [];
  const re = /LATERAL\s*\(/gi;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf("(", m.index);
    if (open === -1) continue;
    let depth = 1;
    let i = open + 1;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    spans.push([open, i]);
  }
  return spans;
}

export function auditSource(relPath, rawSrc) {
  const problems = [];
  const src = stripComments(rawSrc);

  const spans = lateralSpans(src);
  const limitRe = /\bLIMIT\s+(\d+)/gi;
  let lm;
  while ((lm = limitRe.exec(src))) {
    const n = lm[1];
    const insideLateral = spans.some(([s, e]) => lm.index >= s && lm.index < e);
    if (insideLateral && n === "1") continue;
    problems.push(
      `${relPath}: exhibit SQL contains "LIMIT ${n}" — a court schedule must not silently truncate. ` +
        `Remove the cap and fail loud above a safety ceiling instead.`
    );
  }

  const swallowMatch = src.match(/\.catch\s*\(\s*\(\s*\)\s*=>/);
  if (swallowMatch) {
    problems.push(
      `${relPath}: exhibit query swallows failure with .catch(() => …) — a failed query would render ` +
        `as a blank/zero court exhibit. Let it throw.`
    );
  }

  return problems;
}

function listSourceFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      found.push(...listSourceFiles(full));
      continue;
    }
    if (name.endsWith(".ts") && !name.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

function auditTree() {
  const problems = [];
  for (const file of listSourceFiles(SCAN_DIR)) {
    problems.push(...auditSource(file.slice(ROOT.length), readFileSync(file, "utf8")));
  }
  return problems;
}

function selftest() {
  const exhibitF = join(SCAN_DIR, "exhibits/exhibit-f-supporting-docs.ts");
  const realSrc = readFileSync(exhibitF, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "f425c-"));
  const failures = [];

  try {
    // Case 1 — plant the LIMIT cap back into REAL source.
    const withLimit = realSrc.replace(
      /ORDER BY i\.issue_date DESC\n/,
      "ORDER BY i.issue_date DESC\n      LIMIT 200\n"
    );
    if (withLimit === realSrc) failures.push("case1 INERT — mutation did not change the source");
    else if (auditSource("mutated.ts", withLimit).length === 0)
      failures.push("case1 FAIL — planted LIMIT 200 not caught");

    // Case 2 — plant the swallow back into REAL source.
    const withSwallow = realSrc.replace(
      /\[input\.operating_company_id, input\.period_start, input\.period_end\]\n  \);/,
      "[input.operating_company_id, input.period_start, input.period_end]\n  ).catch(() => ({ rows: [] }));"
    );
    if (withSwallow === realSrc) failures.push("case2 INERT — mutation did not change the source");
    else if (auditSource("mutated.ts", withSwallow).length === 0)
      failures.push("case2 FAIL — planted .catch swallow not caught");

    // Case 3 — the CORRECTED shape must NOT be flagged (false positives burn trust as fast as misses).
    const clean = auditTree();
    if (clean.length !== 0)
      failures.push(`case3 FAIL — corrected 425-C tree flagged: ${clean.join("; ")}`);

    // Case 4 — the guard must not flag its own documentation prose.
    const proseOnly = "/* mentions LIMIT 200 and .catch(() => ({rows: []})) in a comment */\nconst x = 1;\n";
    if (auditSource("prose.ts", proseOnly).length !== 0)
      failures.push("case4 FAIL — guard flagged commented-out prose (comment stripping broken)");

    // Case 5 — a LATERAL(...) subquery's LIMIT 1 (pick-one-canonical-row-per-outer-row idiom, the
    // real shape of exhibit-c-bank-reconciliation.ts) must NOT be flagged.
    const lateralOk =
      "const q = `SELECT a.id FROM t a LEFT JOIN LATERAL (SELECT rs.id FROM rs WHERE rs.a_id = a.id ORDER BY rs.updated_at DESC LIMIT 1) s ON TRUE`;";
    if (auditSource("lateral-ok.ts", lateralOk).length !== 0)
      failures.push("case5 FAIL — a LATERAL(...) LIMIT 1 (canonical pick-one idiom) was wrongly flagged");

    // Case 6 — a LATERAL(...) subquery capped at something OTHER than 1 (a real multi-row truncation
    // hiding inside a subquery) must still be caught — the exemption is narrow, not a blanket escape.
    const lateralBad =
      "const q = `SELECT a.id FROM t a LEFT JOIN LATERAL (SELECT rs.id FROM rs WHERE rs.a_id = a.id ORDER BY rs.updated_at DESC LIMIT 5) s ON TRUE`;";
    if (auditSource("lateral-bad.ts", lateralBad).length === 0)
      failures.push("case6 FAIL — a LATERAL(...) LIMIT 5 (a real multi-row cap) was NOT caught");

    // Case 7 — a bare, top-level LIMIT 1 OUTSIDE any LATERAL body (capping the exhibit's own row
    // list to a single record) must still be caught.
    const bareLimitOne = "const q = `SELECT id FROM docs ORDER BY created_at DESC LIMIT 1`;";
    if (auditSource("bare-limit-one.ts", bareLimitOne).length === 0)
      failures.push("case7 FAIL — a bare top-level LIMIT 1 outside any LATERAL was NOT caught");

    if (failures.length) {
      for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: selftest PASS — 2 planted defects caught, corrected tree clean, prose not flagged, ` +
        `LATERAL(...) LIMIT 1 pick-one idiom exempted precisely (LATERAL LIMIT>1 and bare top-level ` +
        `LIMIT 1 both still caught)`
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no silent LIMIT cap and no swallowed query in any Form 425-C exhibit`);
}

main();
