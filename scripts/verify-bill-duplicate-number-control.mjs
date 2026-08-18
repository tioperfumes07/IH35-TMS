#!/usr/bin/env node
/**
 * GUARD: creating a bill must detect a duplicate vendor invoice and require an explicit override.
 *
 * ACCT-F182 (board card LV-AP-DUP). Live-proven 2026-08-06 on USMCA: two accounting.bills rows,
 * same vendor, same bill_number, same amount, same date, created 10.3 s apart — BOTH posted,
 * each DR 5400 / CR 2000 $743.21, leaving $1,486.42 of expense and A/P for ONE $743.21 invoice.
 * Accepted with no warning, no confirm, no override prompt.
 *
 * NOT a double-submit race — the submissions were ten seconds apart, so a disabled button would
 * not have stopped it. And NOT the same defect as ACCT-F180: idempotency protects a RETRY of one
 * request; this is two deliberate requests with different keys. Neither fix subsumes the other,
 * which is exactly why both are needed and why this guard is separate.
 *
 * Duplicate vendor-invoice detection is a baseline AP internal control — QuickBooks Online warns
 * "Bill number already exists for this vendor"; McLeod and NetSuite block or require an override.
 * This is the classic duplicate-payment vector and here it flowed straight to the ledger.
 *
 * The four properties asserted below are the ones whose absence made the defect possible, and
 * each is a way the control could be silently gutted later while still "existing":
 *   1. the duplicate query is ENTITY-SCOPED — bill_number is per-entity, so without
 *      operating_company_id a legitimate USMCA bill collides with an unrelated TRANSP one;
 *   2. voided bills are EXCLUDED — a voided duplicate is precisely what a re-entry replaces;
 *   3. the override is RECORDED — a control that can be bypassed without a trace is not a control;
 *   4. the API answers 409 with the colliding id, not 500 — a warning the caller cannot act on is
 *      just a failure.
 *
 * Run:  node scripts/verify-bill-duplicate-number-control.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/bills.service.ts";
const ROUTES = "apps/backend/src/accounting/bills.routes.ts";
const LABEL = "verify-bill-duplicate-number-control";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

export function collectProblems(svc, routes) {
  const problems = [];
  if (svc == null) return [`missing ${SERVICE}`];
  if (routes == null) return [`missing ${ROUTES}`];

  // Comments are stripped: this fix ships with a long explanatory comment naming every term below,
  // so an un-stripped check would pass on the comment alone after the code was removed. The dup-check
  // SQL itself carries a `-- ACCT-F202:` comment (real SQL syntax, inside a template literal — the
  // JS `//`/`/* */` strip below never touches it) that literally contains the phrase "voided_at IS
  // NULL" while explaining why it's checked, so a naive strip left that phrase surviving even after
  // the real WHERE-clause line was mutated away — found live via this guard's own selftest. Strip
  // ` -- comment` style SQL comments too (space-dash-dash-space, the only style this codebase uses;
  // deliberately narrow so it can never eat a real `i--`/`i --` decrement elsewhere in the file).
  const stripSql = (s) => s.replace(/[ \t]--[ \t][^\n]*/g, "");
  const code = stripSql(svc.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""));
  const routeCode = stripSql(routes.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""));

  // Pick the duplicate-detection query specifically. `.exec` returns the FIRST match in the file,
  // which is some unrelated lookup — that mistake made this guard red against its own fix on the
  // first run. Scan every candidate and take the one that actually tests bill_number.
  //
  // The FROM->LIMIT window was 900 chars, but the real dup-check query's WHERE clause carries a
  // long explanatory SQL `--` comment block (ACCT-F202, entity-scope/void-exclusion rationale) —
  // real SQL comments, not JS `//`/`/* */`, so the comment-strip above never touches them. That
  // pushed the real gap to 948 chars, 48 over the cap, and this guard false-failed against its
  // OWN already-complete, already-correct fix. Widened with real margin for future comment growth.
  const candidates = [...code.matchAll(/SELECT[\s\S]{0,200}?FROM\s+accounting\.bills\b[\s\S]{0,1500}?LIMIT\s+1/gi)].map(
    (m) => m[0]
  );
  const dupQuery = candidates.find((q) => /bill_number\s*=/i.test(q)) ?? "";

  if (!/DuplicateBillNumberError/.test(code)) {
    problems.push(`${SERVICE} must define/throw DuplicateBillNumberError — the control's refusal path.`);
  }
  if (!dupQuery || !/bill_number\s*=/i.test(dupQuery)) {
    problems.push(`${SERVICE} has no bill_number lookup before insert — duplicates are undetected (LV-AP-DUP).`);
  }
  if (dupQuery && !/operating_company_id\s*=/i.test(dupQuery)) {
    problems.push(
      `${SERVICE} duplicate lookup is NOT entity-scoped. bill_number is per-entity, so without ` +
        `operating_company_id a legitimate bill in one entity collides with an unrelated one in another.`
    );
  }
  if (dupQuery && !/voided_at\s+IS\s+NULL/i.test(dupQuery)) {
    problems.push(
      `${SERVICE} duplicate lookup does not exclude voided bills. A voided duplicate is exactly what ` +
        `a re-entry is meant to replace, so including them blocks a legitimate correction.`
    );
  }
  if (!/duplicateOverrideReason/.test(code)) {
    problems.push(`${SERVICE} must accept an explicit override — a hard block makes real bills unenterable.`);
  }
  if (!/bill_duplicate_number_override/.test(code)) {
    problems.push(
      `${SERVICE} must AUDIT the override (who/when/why). A control that can be bypassed without a ` +
        `trace is not a control.`
    );
  }
  // The 409 must live INSIDE the duplicate handler. Testing the file for /409/ anywhere passes on
  // an unrelated route's 409 — my own selftest caught exactly that: downgrading this handler to 500
  // left the guard green because other 409s exist in the file.
  const dupHandler =
    /if\s*\(\s*error\s+instanceof\s+DuplicateBillNumberError\s*\)\s*\{[\s\S]{0,900}?\n\s{6}\}/.exec(
      routeCode
    )?.[0] ?? "";
  if (!dupHandler) {
    problems.push(
      `${ROUTES} does not handle DuplicateBillNumberError — the duplicate would surface as a 500.`
    );
  } else if (!/reply\.code\(409\)/.test(dupHandler)) {
    problems.push(
      `${ROUTES} handles DuplicateBillNumberError but does not answer 409. A warning the caller ` +
        `cannot act on is just a failure.`
    );
  } else if (!/existing_bill_id/.test(dupHandler)) {
    problems.push(
      `${ROUTES} 409 must return existing_bill_id so the UI can link to the bill it collides with.`
    );
  }
  if (!/duplicate_override_reason/.test(routeCode)) {
    problems.push(`${ROUTES} must expose duplicate_override_reason so the caller can actually override.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const svc = read(SERVICE);
  const routes = read(ROUTES);
  const baseline = collectProblems(svc, routes);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree is not green:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  // Every mutation runs through the REAL checker and must come back RED. Two guards shipped today
  // with selftests that regex-tested a string they had just built, or asserted a string contains
  // itself (verify-acct-r17-expense-duplicates does exactly that). Those cannot fail.
  const mutations = [
    ["control removed entirely", svc.replaceAll("DuplicateBillNumberError", "Removed"), routes],
    // Both mutations below are disambiguated with a lookahead requiring `b.bill_number = $2` within
    // reach — bills.service.ts has 15 other `FROM accounting.bills` queries, several with their own
    // unrelated `operating_company_id = $1::uuid` / `voided_at IS NULL` text, so an unanchored
    // regex.replace mutates the WRONG query and this selftest silently proves nothing (found live:
    // the unanchored version mutated an unrelated work-order-linked-bill lookup, not the dup-check
    // query, and both mutations came back "NOT DETECTED" — inert against the real control).
    [
      "entity scope dropped",
      svc.replace(/b\.operating_company_id = \$1::uuid(?=[\s\S]{0,1200}?b\.bill_number = \$2)/, "TRUE"),
      routes,
    ],
    [
      "voided bills no longer excluded",
      svc.replace(/AND b\.voided_at IS NULL\n(?=[\s\S]{0,600}?b\.bill_number = \$2)/, ""),
      routes,
    ],
    ["override no longer audited", svc.replaceAll("bill_duplicate_number_override", "noop"), routes],
    ["override field removed from the API", svc, routes.replaceAll("duplicate_override_reason", "gone")],
    ["409 downgraded", svc, routes.replace(/reply\.code\(409\)/, "reply.code(500)")],
  ];
  const inert = [];
  for (const [why, s, r] of mutations) {
    if (s === svc && r === routes) {
      inert.push(`${why} — MUTATION INERT (changed nothing; proves nothing)`);
      continue;
    }
    if (collectProblems(s, r).length === 0) inert.push(`${why} — NOT DETECTED`);
  }
  if (inert.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of inert) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const problems = collectProblems(read(SERVICE), read(ROUTES));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — bill create detects a same-entity, same-vendor, non-voided duplicate bill_number, ` +
    `refuses it with 409 + the colliding id, and records any override in the audit trail.`
);
