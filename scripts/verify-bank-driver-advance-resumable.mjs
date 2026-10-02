#!/usr/bin/env node
// ROUND 301 audit (CC-1, proven on a Neon fork) — a bank-categorized driver advance can never be booked twice and never
// stops half-done. The dedupe key (driver_advances.linked_bank_txn_id) was written in a third transaction AFTER the
// disbursement JE committed; a failure in between left a posted advance with no key and a retry booked it again. And in
// USMCA the flow could not post at all (no load, no source bank account, no instrument reference reached the core).
// Fails if: (1) the key stops being stamped in the same transaction that creates the advance; (2) a separate post-
// disbursement stamp comes back; (3) decide() stops resuming a part-done run (approved -> disburse; disbursed without a
// recovery deduction -> deduction); (4) the core stops receiving load_id / from_bank_account_id / bank_reference.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-bank-driver-advance-resumable";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/banking/bank-driver-advance.service.ts";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function problems(src) {
  const c = strip(src);
  const p = [];
  if (!/const made = await createEmployeeLoanCore\([\s\S]{0,2500}SET linked_bank_txn_id = \$1::uuid[\s\S]{0,300}return made;/.test(c)) p.push(`${FILE}: the dedupe key must be stamped in the transaction that creates the advance`);
  if ((c.match(/SET linked_bank_txn_id = \$1::uuid/g) ?? []).length !== 1) p.push(`${FILE}: linked_bank_txn_id must be written exactly once (at creation)`);
  if (!/existing\.status === "approved"\) resume = \{[\s\S]{0,120}stage: "disburse"/.test(c) || !/existing\.status === "disbursed" && !existing\.has_deduction\) resume = \{[\s\S]{0,120}stage: "deduction"/.test(c)) p.push(`${FILE}: a part-done run must resume (approved -> disburse; disbursed without deduction -> deduction)`);
  for (const k of ["load_id: input.loadId", "from_bank_account_id: decision.fromBankAccountId", "bank_reference: decision.bankReference"]) {
    if (!c.includes(k)) p.push(`${FILE}: createEmployeeLoanCore must receive ${k.split(":")[0]}`);
  }
  return p;
}

export function run() { return problems(readFileSync(path.join(ROOT, FILE), "utf8")); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["late stamp", src + "\nawait client.query(`UPDATE driver_finance.driver_advances SET linked_bank_txn_id = $1::uuid WHERE id = $2`);"],
      ["no resume", src.replace('stage: "deduction"', 'stage: "disburse"')],
      ["no load", src.replace("load_id: input.loadId ?? null,", "")],
    ];
    for (const [name, planted] of plants) if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — a bank-categorized driver advance is keyed at creation, resumes a part-done run, and reaches the core with load, bank and reference.`);
}
