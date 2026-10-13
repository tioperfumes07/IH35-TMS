#!/usr/bin/env node
/**
 * 18381-verify-creator-fuel-reaches-ledger.mjs
 *
 * Verifies R13/D1 fix: fuel entered via Settlement Creator now posts to the GL.
 *
 * Root cause: settlement-creator.service.ts passed no card rail to createExpenseFromFuelTransaction,
 * so fuel-credit-preference.ts:93 (R-153.7) caught all USMCA no-evidence rows as Relay →
 * threw RelayFillLinksNotPostsError → outcome="relay_link" → no posting.
 *
 * Fix: Creator passes company_direct_credit + creator_manual_entry:true; the relay_fuel_wallet throw
 * is bypassed for Creator entries so the fuel document posts immediately.
 *
 * Checks:
 *   A) creator_manual_entry flag in FuelTxnGlPostCandidate
 *   B) bypass condition on relay_fuel_wallet throw in fuel-credit-preference.ts
 *   C) FuelExpenseDocumentInput gains company_direct_credit + creator_manual_entry
 *   D) createExpenseFromFuelTransaction call in settlement-creator passes both fields (creator_manual_entry for non-Relay rows)
 *   E) outcome="relay_link" still used for non-Creator USMCA rows (no regression)
 *   F) CompanyDirectCredit imported in fuel-expense-document.service.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

let pass = 0;
let fail = 0;
const findings = [];

function check(label, ok, detail) {
  if (ok) { pass++; }
  else { fail++; findings.push(`FAIL ${label}: ${detail}`); }
}

const prefFile = readFileSync(
  path.join(ROOT, "apps/backend/src/accounting/fuel-posting/fuel-credit-preference.ts"),
  "utf8"
);
const docFile = readFileSync(
  path.join(ROOT, "apps/backend/src/fuel/fuel-expense-document.service.ts"),
  "utf8"
);
const creatorFile = readFileSync(
  path.join(ROOT, "apps/backend/src/driver-finance/settlement-creator.service.ts"),
  "utf8"
);

// A — creator_manual_entry in FuelTxnGlPostCandidate
check(
  "A: creator_manual_entry in FuelTxnGlPostCandidate",
  prefFile.includes("creator_manual_entry?: boolean"),
  "FuelTxnGlPostCandidate must declare creator_manual_entry?: boolean"
);

// B — bypass condition on relay_fuel_wallet throw
check(
  "B: relay_fuel_wallet throw bypassed for creator_manual_entry",
  prefFile.includes("relay_fuel_wallet") && prefFile.includes("!candidate.creator_manual_entry"),
  "line 81 must check !candidate.creator_manual_entry before throwing RelayFillLinksNotPostsError"
);

// C — FuelExpenseDocumentInput gains both fields
check(
  "C: FuelExpenseDocumentInput.company_direct_credit",
  docFile.includes("company_direct_credit?: CompanyDirectCredit | null"),
  "FuelExpenseDocumentInput must declare company_direct_credit?: CompanyDirectCredit | null"
);
check(
  "C: FuelExpenseDocumentInput.creator_manual_entry",
  docFile.includes("creator_manual_entry?: boolean"),
  "FuelExpenseDocumentInput must declare creator_manual_entry?: boolean"
);

// D — settlement creator passes both fields
check(
  "D: creator passes company_direct_credit",
  creatorFile.includes("company_direct_credit: fuel.card === \"dreamline\""),
  "settlement-creator must pass company_direct_credit based on fuel.card"
);
// 443.99: Lead option a (2026-10-11, f983f39bf2 / #26270) — a Relay fill is NOT posted as an expense against the
// wallet (trg_relay_wallet_consumed_only_by_relay_fill refuses it); it takes relay_link and posts THROUGH its fill.
// So the bypass is for every non-Relay Creator row, never for a Relay row.
check(
  "D: creator passes creator_manual_entry for every non-Relay row",
  creatorFile.includes('creator_manual_entry: fuel.card !== "relay"'),
  'settlement-creator must pass creator_manual_entry: fuel.card !== "relay" (Dreamline posts at once; Relay posts through its fill)'
);

// E — non-Creator relay_link path still exists (no regression on ACCT-F403)
check(
  "E: relay_link outcome path still present in creator",
  creatorFile.includes("relay_link") && creatorFile.includes("linkSettlementFuelRowToRelayFill"),
  "relay_link → linkSettlementFuelRowToRelayFill path must remain for non-Creator rows"
);

// F — CompanyDirectCredit imported in fuel-expense-document.service.ts
check(
  "F: CompanyDirectCredit imported",
  docFile.includes("CompanyDirectCredit") && docFile.includes("fuel-credit-preference.js"),
  "CompanyDirectCredit must be imported from fuel-credit-preference in fuel-expense-document.service.ts"
);

// Self-test: confirm the bypass is NOT on the non-creator dreamline path (must not bypass for normal rows)
check(
  "Self-test: R-153.7 USMCA throw still present for non-Creator",
  prefFile.includes("USMCA_COMPANY_ID") && prefFile.includes("RelayFillLinksNotPostsError"),
  "R-153.7 throw for USMCA must still exist (only bypassed by creator_manual_entry)"
);

console.log(`\n18381-verify-creator-fuel-reaches-ledger: ${pass} pass, ${fail} fail`);
if (findings.length) findings.forEach(f => console.error(f));
process.exit(fail > 0 ? 1 : 0);
