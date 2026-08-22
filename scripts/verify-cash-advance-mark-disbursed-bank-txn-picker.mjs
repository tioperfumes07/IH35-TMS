#!/usr/bin/env node
/**
 * ACCT-F5965 — MarkDisbursedModal.tsx's "Bank transaction" field must be a searchable
 * bank-transaction Combobox (mirroring FineLifecycleActions.tsx's identical pattern), never a
 * raw free-text input — the backend correctly types bank_txn_id as z.string().uuid().optional()
 * (a genuine FK consumed in 2 real UPDATEs against banking.bank_transactions/
 * driver_finance.driver_advances), so a free-text box threw a raw "Invalid UUID" error at any
 * operator who typed a human-readable reference.
 *
 * Live-verified 2026-08-22 (CC-2, port 9224): typing a reference string -> "Invalid UUID";
 * leaving the field empty -> succeeds. The fix here removes the free-text path entirely for this
 * field — it is now select-a-real-transaction-or-leave-empty, matching the backend's own
 * semantics honestly.
 */
import fs from "node:fs";

const LABEL = "verify-cash-advance-mark-disbursed-bank-txn-picker";
const FILE = "apps/frontend/src/pages/cash-advances/components/MarkDisbursedModal.tsx";
const checks = [
  [/import \{ getPlaidCompanyTransactions \} from "\.\.\/\.\.\/\.\.\/api\/banking";/, "imports the same company-transactions source FineLifecycleActions.tsx uses"],
  [/import \{ Combobox \} from "\.\.\/\.\.\/\.\.\/components\/shared\/Combobox";/, "imports the shared Combobox component"],
  [/const bankTxQuery = useQuery\(\{[\s\S]{0,400}getPlaidCompanyTransactions\(operatingCompanyId/, "queries getPlaidCompanyTransactions for the picker's option source"],
  [/<Combobox\s*\n\s*options=\{bankOptions\}\s*\n\s*value=\{bankTxnId\}\s*\n\s*onChange=\{setBankTxnId\}/, "the Bank transaction field renders a real Combobox bound to bankTxnId, not a raw <input>"],
];
const src = fs.readFileSync(FILE, "utf8");
const audit = (text) => checks.filter(([re]) => !re.test(text)).map(([, msg]) => msg);
const failures = audit(src);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = src.replace(new RegExp(re.source, flags), "/* planted ACCT-F5965 defect */");
    if (planted === src || !audit(planted).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — Mark Disbursed's bank-transaction field is a real picker, never a free-text UUID box`);
