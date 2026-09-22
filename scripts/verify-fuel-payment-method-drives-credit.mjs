#!/usr/bin/env node
/**
 * FUEL-08 — company_direct fuel credit must follow the real payment method.
 * FAIL if maybe-post hardcodes company_direct_credit: "cash" (the live defect that
 * credited undeposited/cash for fleet-card / Relay settles).
 *
 * REVISED 2026-09-22 (ROUND 43 FOLLOW-UP item 2, LANE_CROSS —
 * docs/bus/LEAD-RULING-2026-09-22-CC3-ROUND-43-CUT-RELAY-INGEST-CROSS-LANE.md): relay-fuel-ingest
 * no longer computes a gl_post_candidate at all (no fuel row, no GL — banking.bank_transactions
 * visibility only). The has_fuel_card-on-Relay-candidate check below is retired along with the
 * candidate it checked; the fuel-transaction-import.ts check (Dreamline/manual imports, the ONLY
 * remaining live GL-posting pathway for fuel) is unchanged and still enforced.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-payment-method-drives-credit";
const SELFTEST = process.argv.includes("--selftest");

const MAYBE_POST = path.join(
  ROOT,
  "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts"
);
const INGEST = path.join(ROOT, "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts");
const IMPORT = path.join(ROOT, "apps/backend/src/fuel/fuel-transaction-import.ts");

/** @param {{ maybePost: string, ingest: string, importSrc: string }} sources */
export function check(sources) {
  const problems = [];
  const { maybePost, ingest, importSrc } = sources;
  if (!maybePost) problems.push("missing maybe-post-from-fuel-transaction.service.ts");
  else {
    if (/company_direct_credit:\s*"cash"/.test(maybePost)) {
      problems.push('maybe-post must NOT hardcode company_direct_credit: "cash"');
    }
    if (!/resolveCompanyDirectCreditPreference/.test(maybePost)) {
      problems.push("resolveCompanyDirectCreditPreference helper must exist and be used");
    }
    if (!/loadFuelTxnCreditSignals/.test(maybePost)) {
      problems.push("maybe-post must load fuel.fuel_transactions credit signals (fuel_card_id/notes/source)");
    }
  }
  if (!ingest) problems.push("missing relay-fuel-ingest.service.ts");
  else if (/gl_post_candidate:\s*\{/.test(ingest)) {
    // ROUND 43 FOLLOW-UP item 2: a real gl_post_candidate object literal (not the always-null
    // return) reappearing here means the fuel.fuel_transactions bridge / GL posting came back --
    // if it ever does, has_fuel_card must be stamped on it again, same as before.
    if (!/has_fuel_card/.test(ingest)) {
      problems.push("relay-fuel-ingest computes a real gl_post_candidate again but does not stamp has_fuel_card on it");
    }
  }
  if (!importSrc) problems.push("missing fuel-transaction-import.ts");
  else if (!/has_fuel_card/.test(importSrc)) {
    problems.push("fuel-transaction-import must stamp has_fuel_card on gl_post candidates");
  }
  return problems;
}

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function selftest() {
  const good = {
    maybePost: `
      export function resolveCompanyDirectCreditPreference() { return "ap"; }
      async function loadFuelTxnCreditSignals() { return {}; }
      const companyDirectCredit = resolveCompanyDirectCreditPreference(candidate, txnSignals);
    `,
    ingest: `has_fuel_card: !Boolean(tx.cash_advance),`,
    importSrc: `has_fuel_card: Boolean(row.card_number),`,
  };
  const bad = {
    maybePost: `company_direct_credit: "cash",`,
    ingest: `cash_advance: false,`,
    importSrc: `cash_advance: false,`,
  };
  // ROUND 43 FOLLOW-UP item 2: the ingest side no longer builds a real gl_post_candidate at all
  // (no fuel row, no GL — see this guard's own header). A real candidate object literal reappearing
  // without has_fuel_card must still be caught; a stub that returns null (today's real shape) must
  // NOT be flagged as missing has_fuel_card.
  const ingestNoCandidate = { ...good, ingest: `return { relay_fuel_transaction_id, gl_post_candidate: null };` };
  const ingestRealCandidateMissingFlag = {
    ...good,
    ingest: `return { relay_fuel_transaction_id, gl_post_candidate: { fuel_transaction_id: bridge.fuel_transaction_id, fuel_type: "diesel" } };`,
  };
  if (check(good).length) throw new Error(`${LABEL} selftest: compliant sources flagged`);
  if (!check(bad).length) throw new Error(`${LABEL} selftest: hardcoded cash / missing has_fuel_card not caught`);
  if (check(ingestNoCandidate).length) throw new Error(`${LABEL} selftest: always-null gl_post_candidate wrongly flagged`);
  if (!check(ingestRealCandidateMissingFlag).length) throw new Error(`${LABEL} selftest: real gl_post_candidate missing has_fuel_card not caught`);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const problems = check({
  maybePost: read(MAYBE_POST),
  ingest: read(INGEST),
  importSrc: read(IMPORT),
});
if (problems.length) {
  console.error(`${LABEL} — FAILED`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`${LABEL} — OK`);
