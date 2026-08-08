#!/usr/bin/env node
/**
 * GUARD: a load rate change must re-sync its PROFORMA invoice, and must NOT touch an issued one.
 * ACCT-F270 / FAIL-I1.
 *
 * update-load.service.ts already computed `rateChanged` and used it for exactly one thing: an audit
 * field. The system knew the rate had moved and told nobody. Live: L-20260808-0104 carries rate 9500
 * while its invoice INV-2026-00027 still reads 6000 — built from a snapshot (ACCT-F267) and never
 * refreshed.
 *
 * THE BOUNDARY IS THE SAFETY ARGUMENT, and this guard exists to keep it exactly where it is:
 *   · PROFORMA  → re-sync. It is a non-posting projection; no journal entry exists for it (verified:
 *                 all USMCA proformas have zero JEs) and nobody has been sent it. Updating a draft.
 *   · sent / partial / paid → NEVER. That is a document someone has acted on; its amount must not move
 *                 underneath them. Same principle that made ACCT-F267 refuse CREATION rather than
 *                 mutate later.
 *   · voided → never revived.
 *
 * So the guard fails BOTH ways: if the re-sync is missing (the defect) and if it is not constrained to
 * proforma + not-voided (a worse defect than the original, because it would silently rewrite issued
 * customer paperwork).
 *
 * Run:  node scripts/verify-rate-change-resyncs-proforma.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/backend/src/dispatch/update-load.service.ts";
const LABEL = "verify-rate-change-resyncs-proforma";

export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** Isolate the statement that updates invoice_lines, so unrelated SQL cannot satisfy the checks. */
export function resyncStatement(src) {
  const clean = stripComments(src);
  const m = /UPDATE\s+accounting\.invoice_lines[\s\S]{0,1200}?(?:RETURNING[^`;]*|;|`)/i.exec(clean);
  return m ? m[0] : null;
}

export function collectProblems(src) {
  const clean = stripComments(src);
  const problems = [];
  if (!/rateChanged/.test(clean)) {
    problems.push(
      `${SRC}: rateChanged not found — if the rate-change detection moved, move this guard with it ` +
        `(ACCT-F270).`
    );
    return problems;
  }
  const stmt = resyncStatement(src);
  if (!stmt) {
    problems.push(
      `${SRC}: a rate change never re-syncs the load's invoice. rateChanged is computed and used only ` +
        `for an audit field, so the invoice keeps the rate it was created with — L-20260808-0104 rate ` +
        `9500 vs INV-2026-00027 still 6000 (FAIL-I1).`
    );
    return problems;
  }
  if (!/status\s*=\s*'proforma'/i.test(stmt)) {
    problems.push(
      `${SRC}: the invoice re-sync is not restricted to status='proforma'. Rewriting a sent, partial or ` +
        `paid invoice changes a document the customer has already acted on — worse than the stale ` +
        `amount it fixes (ACCT-F270).`
    );
  }
  if (!/voided_at\s+IS\s+NULL/i.test(stmt)) {
    problems.push(
      `${SRC}: the invoice re-sync does not exclude voided invoices, so a dead document could be ` +
        `silently revived with a new amount (ACCT-F270).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD =
    "let rateChanged = true;\nawait c.query(`UPDATE accounting.invoice_lines l SET line_total_cents = $3 FROM accounting.invoices i WHERE i.source_load_id = $1 AND i.status = 'proforma' AND i.voided_at IS NULL RETURNING i.id`);";
  const MISSING = "let rateChanged = true;\nawait appendCrudAudit(c, u, 'dispatch.load.patched', { rate_total_changed: rateChanged });";
  const NO_PROFORMA =
    "let rateChanged = true;\nawait c.query(`UPDATE accounting.invoice_lines l SET line_total_cents = $3 FROM accounting.invoices i WHERE i.source_load_id = $1 AND i.voided_at IS NULL RETURNING i.id`);";
  const NO_VOID =
    "let rateChanged = true;\nawait c.query(`UPDATE accounting.invoice_lines l SET line_total_cents = $3 FROM accounting.invoices i WHERE i.source_load_id = $1 AND i.status = 'proforma' RETURNING i.id`);";

  if (collectProblems(GOOD).length !== 0) failures.push("the correct re-sync was flagged");
  if (!collectProblems(MISSING).some((p) => /never re-syncs/.test(p))) failures.push("the missing re-sync was NOT caught");
  if (!collectProblems(NO_PROFORMA).some((p) => /not restricted to status='proforma'/.test(p))) {
    failures.push("an unrestricted re-sync was accepted — it would rewrite ISSUED invoices");
  }
  if (!collectProblems(NO_VOID).some((p) => /does not exclude voided/.test(p))) {
    failures.push("a re-sync that could revive a voided invoice was accepted");
  }
  const COMMENT = MISSING + "\n// UPDATE accounting.invoice_lines ... status = 'proforma' voided_at IS NULL";
  if (!collectProblems(COMMENT).some((p) => /never re-syncs/.test(p))) {
    failures.push("a comment faked the re-sync — false green");
  }
  if (!collectProblems("const x = 1;").some((p) => /rateChanged not found/.test(p))) {
    failures.push("a missing detector did not fail closed");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (correct passes, missing caught, unrestricted caught, voided-revival ` +
      `caught, comment cannot fake, fails closed)`
  );
  process.exit(0);
}

const p = path.join(root, SRC);
if (!fs.existsSync(p)) {
  console.error(`${LABEL} FAIL — ${SRC} is missing.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(p, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} rate-resync gap(s):`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — a rate change re-syncs the proforma invoice and never touches an issued one.`);
