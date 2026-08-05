#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-10-cancel-economics (CLS-DISP-WIRE-10)
 *
 * THE DEFECT THIS ASSERTS — measured on prod, and I caused an instance of it myself
 * cancelLoad() set mdata.loads.status='cancelled', wrote an audit row, and touched NOTHING else: no
 * invoice, no driver bill, no posting. A cancelled load therefore kept the proforma invoice created
 * at booking (WIRE-01) and the driver bill created at assign (WIRE-02) — phantom A/R and a phantom
 * payable for work that will never happen. Prod at the time of the fix: 1 cancelled load, and
 * B-20260616-0120-R1 still status='open' against it for $960.00.
 *
 * THE ASYMMETRY IS THE POINT — do not "simplify" it away
 *  * A PROFORMA invoice is a non-posting projection of a load that is now cancelled: nothing was
 *    recognised, nothing billed, so voiding it is safe and unambiguous. It is voided automatically.
 *  * A 'sent'/'paid' invoice is a REAL customer obligation (a TONU or cancellation charge can be
 *    genuinely owed). Auto-voiding that would destroy real A/R, so it is surfaced, never voided.
 *  * A DRIVER BILL is NOT auto-voided either. A cancelled load can still owe the driver —
 *    truck-ordered-not-used, deadhead already run, a layover already incurred. Blanket voiding would
 *    silently strip pay a driver earned, which is the mirror image of the original bug.
 *
 * So this guard fails BOTH ways: if the money artifacts stop being handled at all, AND if someone
 * makes cancellation void driver bills or non-proforma invoices wholesale.
 *
 * METHOD: comments and string literals stripped before asserting (this header names every symbol
 * under test); --selftest mutates the REAL source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-disp-wire-10-cancel-economics";
const SVC = "apps/backend/src/dispatch/cancellation.service.ts";

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
  const code = stripCommentsAndStrings(raw);
  const withStrings = stripCommentsOnly(raw);
  const errors = [];

  // 1. Cancellation must reach the invoice at all.
  if (!/accounting\.invoices/.test(withStrings)) {
    errors.push(
      `${SVC}: cancellation never touches accounting.invoices — a cancelled load keeps its proforma ` +
        `invoice alive (phantom A/R). This is the WIRE-10 regression.`
    );
  }
  // 2. ...and must void ONLY the proforma.
  if (!/status\s*=\s*'proforma'/.test(withStrings)) {
    errors.push(
      `${SVC}: the invoice void is not restricted to status='proforma' — voiding a sent or paid ` +
        `invoice would destroy real A/R that a TONU or cancellation charge may legitimately owe`
    );
  }

  // 3. Driver bills must be observed...
  if (!/driver_finance\.driver_bills/.test(withStrings)) {
    errors.push(
      `${SVC}: cancellation never looks at driver_finance.driver_bills — an open payable is left ` +
        `against a cancelled load with nothing recording it`
    );
  }
  // 4. ...but never blanket-voided (that would strip TONU/deadhead pay a driver earned).
  if (/UPDATE\s+driver_finance\.driver_bills[\s\S]{0,200}status\s*=\s*'void'/i.test(withStrings)) {
    errors.push(
      `${SVC}: cancellation VOIDS driver bills wholesale — a cancelled load can still owe the driver ` +
        `(truck-ordered-not-used, deadhead, layover). Whether it does is a business decision, not a ` +
        `default this function may take.`
    );
  }

  // 5. The outcome must be countable, not silent.
  if (!/cancellation_money_artifacts/.test(withStrings)) {
    errors.push(
      `${SVC}: no durable record of what cancellation did to the money artifacts — the open payable ` +
        `would sit unnoticed exactly as it did before`
    );
  }
  if (!/appendCrudAudit\(/.test(code)) {
    errors.push(`${SVC}: appendCrudAudit is not called — the cancellation trail is not written`);
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
    ["invoices no longer touched", (s) => s.split("accounting.invoices").join("accounting.something_else")],
    ["voids any invoice, not just proforma", (s) => s.replace("AND status = 'proforma'", "")],
    ["driver bills no longer observed", (s) => s.split("driver_finance.driver_bills").join("driver_finance.other")],
    [
      "driver bills blanket-voided",
      (s) =>
        s.replace(
          "SELECT bill_number, gross_amount_cents::text\n              FROM driver_finance.driver_bills",
          "UPDATE driver_finance.driver_bills SET status = 'void' FROM driver_finance.driver_bills"
        ),
    ],
    ["outcome made silent", (s) => s.split("cancellation_money_artifacts").join("nothing_recorded")],
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

const errors = check(readFileSync(SVC, "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in cancellation economics:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — cancellation voids the proforma, leaves real obligations for a human, never ` +
    `blanket-voids driver pay, and records what it did.`
);
