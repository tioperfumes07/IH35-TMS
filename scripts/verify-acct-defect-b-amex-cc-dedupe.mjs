#!/usr/bin/env node
/**
 * GO-CLOSE-188 CC-1 DEFECT B -- static-shape guard for
 * db/migrations/202613291100_acct_defect_b_amex_cc_ledger_account_dedupe.sql.
 *
 * Confirms the migration (1) idempotently creates a USMCA Amex Credit Card Payable liability account
 * only when one isn't already present, (2) repoints the TEST DATA Amex bank_accounts row keyed on the
 * defect itself (credit-class account pointed at a non-Liability), not unconditionally, and (3) adds a
 * partial unique index so no two active bank accounts, in any entity, can ever again share one
 * ledger_account_id. Live behavior (the actual repoint + index creation) was dry-run verified in a
 * rolled-back Neon transaction before this guard was written -- see the migration file's own header.
 */
import { readFileSync } from "node:fs";

const FILE = "db/migrations/202613291100_acct_defect_b_amex_cc_ledger_account_dedupe.sql";

function analyze(src) {
  const failures = [];

  if (!/account_number = '2500'/.test(src) || !/'2500', 'Amex Credit Card Payable'/.test(src)) {
    failures.push("does not idempotently create/find the USMCA #2500 Amex Credit Card Payable account");
  }
  if (!/ON CONFLICT \(operating_company_id, account_number\) DO NOTHING/.test(src)) {
    failures.push("account creation is not idempotent (missing ON CONFLICT DO NOTHING)");
  }
  if (!/account_name ILIKE 'TEST DATA Amex%'/.test(src)) {
    failures.push("repoint is not keyed to the TEST DATA Amex bank account specifically");
  }
  if (!/l\.account_type <> 'Liability'/.test(src)) {
    failures.push("repoint is not keyed on the defect itself (currently pointed at a non-Liability) -- would not be a safe no-op on a hand-fixed row");
  }
  if (!/CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_active_ledger_account_uidx/.test(src)) {
    failures.push("missing the preventive partial unique index on banking.bank_accounts(operating_company_id, ledger_account_id)");
  }
  if (!/WHERE is_active = true AND deactivated_at IS NULL AND ledger_account_id IS NOT NULL/.test(src)) {
    failures.push("unique index WHERE clause does not match is_active/deactivated_at/ledger_account_id NOT NULL shape");
  }
  if (!/RESET ROLE/.test(src) === false) {
    // No RESET ROLE expected inside the migration file itself (that's a Neon-console-only bypass_rls
    // concern for ad-hoc queries) -- migrations run as the owning role already. Not a failure either way.
  }

  return failures;
}

function readSrc() {
  return readFileSync(FILE, "utf8");
}

function selftest() {
  const src = readSrc();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-acct-defect-b-amex-cc-dedupe --selftest: FAIL on the real (good) migration");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "account creation loses ON CONFLICT idempotency",
      apply: (s) => s.replace("ON CONFLICT (operating_company_id, account_number) DO NOTHING\n", ""),
    },
    {
      name: "repoint match loses the TEST DATA Amex name filter",
      apply: (s) => s.replace("b.account_name ILIKE 'TEST DATA Amex%'\n", "1=1\n"),
    },
    {
      name: "repoint match loses the non-Liability defect keying",
      apply: (s) => s.replace("l.account_type <> 'Liability'\n", "1=1\n"),
    },
    {
      name: "preventive unique index dropped entirely",
      apply: (s) => s.replace(/CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_active_ledger_account_uidx[\s\S]*?ledger_account_id IS NOT NULL;\n/, ""),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(src);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-acct-defect-b-amex-cc-dedupe --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = readSrc();
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-acct-defect-b-amex-cc-dedupe: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-acct-defect-b-amex-cc-dedupe: OK -- migration idempotently creates the USMCA Amex CC liability account, repoints only the defect-matching bank account, and adds the preventive unique index"
  );
}
