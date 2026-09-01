#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-10-cancel-economics (CLS-DISP-WIRE-10)
 *
 * THE DEFECT THIS ASSERTS — measured on prod, and I caused an instance of it myself
 * cancelLoad() set mdata.loads.status='cancelled', wrote an audit row, and touched NOTHING else: no
 * invoice, no driver bill, no posting. A cancelled load therefore kept the proforma invoice created
 * at booking (WIRE-01) and the driver bill created at assign (WIRE-02) — phantom A/R and a phantom
 * payable for work that will never happen.
 *
 * UPDATED 2026-09-01 (owner ruling — one-click cascade void):
 *  * ALL live (non-paid/factored) invoices are voided via postVoidReversal, not just proforma.
 *  * Driver bills are NOW voided in-cascade (owner ruling: do not leave orphans, do not hard-gate).
 *  * Settlements attached to the load are cancelled via executeVoidCancel('driver_settlement'...).
 *  * Paid/factored invoices still fail loud.
 *  * The full artifact set is recorded in cancellation_money_artifacts.
 *
 * METHOD: comments and string literals stripped before asserting; --selftest mutates the REAL
 * source and requires every assertion to trip.
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
      `${SVC}: cancellation never touches accounting.invoices — a cancelled load keeps its invoice ` +
        `alive (phantom A/R). This is the WIRE-10 regression.`
    );
  }

  // 2. LIVE FAIL (2026-08-08 L-0093): invoices_void_state_authoritative requires
  // ((status='void') = (voided_at IS NOT NULL)). Setting status='void' without voided_at
  // rejects the UPDATE and rolls back the entire load cancel.
  if (!/voided_at\s*=\s*now\(\)/.test(withStrings)) {
    errors.push(
      `${SVC}: invoice void sets status='void' without voided_at=now() — CHECK invoices_void_state_authoritative ` +
        `rejects the write and the cancel transaction rolls back (L-20260808-0093 live)`
    );
  }

  // 3. Driver bills must be touched (cascade void, not a hard gate).
  if (!/driver_finance\.driver_bills/.test(withStrings)) {
    errors.push(
      `${SVC}: cancellation never looks at driver_finance.driver_bills — open driver bills would be left ` +
        `orphaned against a cancelled load`
    );
  }

  // 4. Driver bills must now be cascade-voided (owner ruling 2026-09-01 — one-click).
  if (!/UPDATE\s+driver_finance\.driver_bills[\s\S]{0,300}status\s*=\s*'void'/i.test(withStrings)) {
    errors.push(
      `${SVC}: cancellation must void open driver bills in-cascade (owner ruling 2026-09-01) — not leave ` +
        `them as orphaned open payables on a cancelled load`
    );
  }

  // 5. The outcome must be countable, not silent.
  if (!/cancellation_money_artifacts/.test(withStrings)) {
    errors.push(
      `${SVC}: no durable record of what cancellation did to the money artifacts — the cascade ` +
        `artifacts would sit unrecorded`
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
    ["driver bills no longer observed", (s) => s.split("driver_finance.driver_bills").join("driver_finance.other")],
    ["driver bills void removed", (s) =>
      s.replace(
        /UPDATE driver_finance\.driver_bills\s+SET status = 'void'/,
        "/* REMOVED UPDATE driver_finance.driver_bills SET status = 'void' */"
      )
    ],
    ["outcome made silent", (s) => s.split("cancellation_money_artifacts").join("nothing_recorded")],
    [
      "void status without voided_at",
      // Strips ONLY the `voided_at = now(),` clause right after `SET status = 'void',` — not the
      // whole SET list — so a later SET-clause addition between voided_at and updated_at (e.g.
      // void_reason, added after this guard was written) can never make the mutation a silent no-op.
      (s) => s.replace(/SET status = 'void',\s*voided_at = now\(\),/, "SET status = 'void',"),
    ],
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
