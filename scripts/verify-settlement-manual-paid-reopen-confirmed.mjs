#!/usr/bin/env node
/**
 * FINDING: LV-SETTLEMENT-MANUAL-PAID-NO-CONFIRM-NO-REOPEN (carries ACCT-F5401) — found live
 * 2026-08-17 during Settlements Wave D2 live-verify: clicking "Mark Paid Manually" on a real
 * settlement (S-2026-0002, USMCA) fired IMMEDIATELY with no confirmation step, using a stale
 * prefilled "check" default in the Payment method field, and transitioned payment_state to
 * manual_paid — a TERMINAL state in the app's own state machine (validateTransition()'s
 * `manual_paid: []`). There was no way back short of a code change.
 *
 * FIX: (1) both "Mark Paid Manually" click handlers in SettlementDetailPage.tsx now require a
 * window.confirm() before firing the mutation. (2) A new, separately-audited correction path
 * (reopenManualPaid in settlement-payment.service.ts + POST /api/v1/driver-pay/settlements/:id/
 * reopen-manual-paid + a "Reopen (correction)" UI action gated to Owner/Admin, requiring a written
 * reason) lets an erroneous manual-paid mark be corrected back to unpaid without erasing the
 * original marked_paid_manually event (VOID = reversal, nothing deletable — a new
 * reopened_correction event is appended instead). Migration 202612740000 widens the
 * settlement_payment_events.event_type CHECK constraint to allow the new value.
 *
 * Static check (always runs): both call sites of markSettlementPaidManually in
 * SettlementDetailPage.tsx are preceded by a window.confirm() guard; a "Reopen (correction)" action
 * calling reopenSettlementManualPaid exists; the backend exports reopenManualPaid and registers the
 * reopen-manual-paid route; the migration's CHECK constraint includes 'reopened_correction'.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-manual-paid-reopen-confirmed";
const FE_REL = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const SVC_REL = "apps/backend/src/driver-finance/settlement-payment.service.ts";
const ROUTES_REL = "apps/backend/src/driver-finance/settlement-payment.routes.ts";
const MIGRATION_REL = "db/migrations/202612740000_settlement_manual_paid_reopen_correction.sql";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against mutated in-memory copies. */
export function assertReopenConfirmed(feSource, svcSource, routesSource, migrationSource) {
  const errors = [];

  // Every "Mark Paid Manually" mutation call must be preceded within a short window by a
  // window.confirm( guard — split on the call site and look backward for the nearest confirm.
  const callSites = [...feSource.matchAll(/void markSettlementPaidManually\(/g)];
  if (callSites.length < 2) {
    errors.push(`only ${callSites.length} of 2 expected markSettlementPaidManually call sites found`);
  }
  for (const call of callSites) {
    const before = feSource.slice(Math.max(0, call.index - 600), call.index);
    if (!/window\.confirm\(/.test(before)) {
      errors.push(`markSettlementPaidManually call at offset ${call.index} has no window.confirm( guard within 600 chars before it`);
    }
  }

  if (!/reopenSettlementManualPaid\(/.test(feSource)) {
    errors.push('no "Reopen (correction)" UI call to reopenSettlementManualPaid found in SettlementDetailPage.tsx');
  }

  if (!/export async function reopenManualPaid\(/.test(svcSource)) {
    errors.push("settlement-payment.service.ts does not export reopenManualPaid");
  }

  if (!/\/reopen-manual-paid/.test(routesSource)) {
    errors.push("settlement-payment.routes.ts does not register a reopen-manual-paid route");
  }

  if (!/reopened_correction/.test(migrationSource)) {
    errors.push("migration does not widen event_type CHECK to include reopened_correction");
  }

  return errors;
}

function selftest() {
  const problems = [];
  const fe = read(FE_REL);
  const svc = read(SVC_REL);
  const routes = read(ROUTES_REL);
  const migration = read(MIGRATION_REL);

  const liveErrors = assertReopenConfirmed(fe, svc, routes, migration);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "confirm guard removed from both call sites",
      [fe.replace(/window\.confirm\(\s*\n?\s*`Mark [^`]*`\s*\n?\s*\)/g, "true")],
      [svc, routes, migration],
      "no window.confirm(",
    ],
    [
      "reopen route deleted",
      [fe],
      [svc, routes.replace(/\/reopen-manual-paid/g, "/removed-route"), migration],
      "does not register a reopen-manual-paid route",
    ],
    [
      "reopenManualPaid export deleted",
      [fe],
      [svc.replace("export async function reopenManualPaid(", "async function reopenManualPaidRenamed("), routes, migration],
      "does not export reopenManualPaid",
    ],
  ];

  for (const [name, [mutatedFe], [mutatedSvc, mutatedRoutes, mutatedMigration], expectFragment] of cases) {
    if (mutatedFe === fe && mutatedSvc === svc && mutatedRoutes === routes && mutatedMigration === migration) {
      problems.push(`planted regression "${name}" did not actually mutate any source — the selftest is inert`);
      continue;
    }
    const found = assertReopenConfirmed(mutatedFe, mutatedSvc, mutatedRoutes, mutatedMigration);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertReopenConfirmed(read(FE_REL), read(SVC_REL), read(ROUTES_REL), read(MIGRATION_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}

main();
