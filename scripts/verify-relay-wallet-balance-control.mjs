#!/usr/bin/env node
/**
 * GUARD — verify-relay-wallet-balance-control (CONN-3)
 *
 * WHY THE CONTROL MUST BEHAVE EXACTLY THIS WAY
 * The Relay wallet is carried as an ASSET for one reason: so its balance can be proved against Relay's
 * reported balance. That is the whole justification for not expensing fuel straight off the bank feed.
 * A wallet account with no control attached is bookkeeping that looks rigorous and verifies nothing.
 *
 * WHAT IS ASSERTED
 *   1. READ-ONLY. A reconciliation control that writes — posts, corrects, or "fixes" — cannot be
 *      trusted to report its own exceptions. RECON-01 says read-only, never auto-fix.
 *   2. NO DOLLAR THRESHOLD on in_balance. Materiality is a reporting judgement, not a reconciliation
 *      one: a control that ignores small differences cannot prove the large ones are the only ones.
 *   3. `unclassified` deposits are EXCLUDED from funded_cents and reported separately. An unidentified
 *      funding card may be an owner loan or a capital contribution; folding it into expectations would
 *      make the control quietly absorb exactly what it does not understand.
 *   4. A missing wallet account reports `unavailable_reason`, never a row of zeroes — zeroes would
 *      read as "perfectly reconciled" when the truth is "cannot be computed".
 *   5. Entity-scoped on every read.
 *
 * METHOD: comments and string literals stripped before structural assertions. --selftest mutates the
 * REAL source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-relay-wallet-balance-control";
const SVC = "apps/backend/src/integrations/relay-payments/relay-wallet-balance-control.service.ts";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}
function stripCommentsOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function check(raw) {
  const errors = [];
  if (!raw) {
    errors.push(`${SVC}: missing — the Relay wallet has no reconciling control, so its balance proves nothing.`);
    return errors;
  }
  const code = stripCommentsAndStrings(raw);
  const withStrings = stripCommentsOnly(raw);

  // 1. Read-only.
  for (const w of ["INSERT INTO", "UPDATE ", "DELETE FROM"]) {
    if (new RegExp(w, "i").test(withStrings)) {
      errors.push(
        `${SVC}: contains "${w.trim()}" — the wallet control must be READ-ONLY. A reconciliation that ` +
          `corrects its own exceptions cannot be trusted to report them (RECON-01).`
      );
    }
  }

  // 2. No materiality threshold on the in_balance verdict.
  if (!/in_balance:\s*ledger\s*-\s*expected\s*===\s*0/.test(code)) {
    errors.push(
      `${SVC}: in_balance is not an exact zero test. A dollar threshold cannot be introduced here — ` +
        `a control that ignores small divergences cannot prove the large ones are the only ones.`
    );
  }

  // 3. Unclassified excluded from funded, and surfaced.
  if (!/classification\s*=\s*''company''|classification = "company"|'company'/.test(withStrings)) {
    errors.push(`${SVC}: funded_cents is not restricted to company-classified deposits.`);
  }
  if (!/unclassified_cents/.test(code)) {
    errors.push(
      `${SVC}: unclassified deposits are not reported separately — folding them into expectations makes ` +
        `the control absorb precisely what it does not understand (they may be owner loans or capital).`
    );
  }

  // 4. Missing wallet reports unavailability rather than zeroes.
  if (!/unavailable_reason/.test(code) || !/no_wallet_account/.test(withStrings)) {
    errors.push(
      `${SVC}: a missing wallet account does not report unavailable_reason — returning zeroes would ` +
        `read as "perfectly reconciled" when the control simply cannot be computed.`
    );
  }

  // 5. Entity scoping on every read.
  const reads = (withStrings.match(/FROM\s+(catalogs\.accounts|accounting\.journal_entry_postings|integrations\.relay_deposits|fuel\.fuel_transactions)/gi) ?? []).length;
  const scopes = (withStrings.match(/operating_company_id\s*=\s*\$\d::uuid/g) ?? []).length;
  if (reads > scopes) {
    errors.push(
      `${SVC}: ${reads} scoped-table read(s) but only ${scopes} operating_company_id predicate(s) — one ` +
        `entity's wallet control would include another entity's rows.`
    );
  }
  return errors;
}

function selftest() {
  const real = readFileSync(SVC, "utf8");
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["control starts writing", (s) => s.replace("SELECT COALESCE(", "UPDATE x SET y=1; SELECT COALESCE(")],
    ["materiality threshold introduced", (s) => s.replace("in_balance: ledger - expected === 0", "in_balance: Math.abs(ledger - expected) < 100")],
    ["unclassified folded away", (s) => s.split("unclassified_cents").join("ignored_cents")],
    ["missing wallet reports zeroes", (s) => s.split("unavailable_reason").join("fine_reason")],
    ["entity scope dropped", (s) => s.replace("AND p.operating_company_id = $2::uuid", "")],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

let src = "";
try {
  src = readFileSync(SVC, "utf8");
} catch {
  src = "";
}
const errors = check(src);
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in the Relay wallet control:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — the wallet control is read-only, flags every divergence with no threshold, keeps ` +
    `unclassified deposits visible, and reports unavailability instead of a misleading zero.`
);
