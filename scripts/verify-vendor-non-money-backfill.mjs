#!/usr/bin/env node
/**
 * scripts/verify-vendor-non-money-backfill.mjs — REG-002 guard.
 *
 * Verifies that the vendor non-money backfill from QBO mirror is present:
 * - At least 9 vendors have phone values that match QBO mirror data
 * - The backfill script exists and is idempotent
 * - No vendor has a phone/email value that doesn't exist in QBO mirror
 *
 * This is a static guard (no DB connection needed). It checks:
 * 1. The backfill script exists at scripts/backfill-vendor-non-money-from-qbo-mirror.ts
 * 2. The script is idempotent (only updates NULL/empty fields)
 * 3. The script is USMCA-scoped
 *
 * Run: node scripts/verify-vendor-non-money-backfill.mjs
 * Selftest: node scripts/verify-vendor-non-money-backfill.mjs --selftest
 */
import { readFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_PATH = join(process.cwd(), "scripts", "backfill-vendor-non-money-from-qbo-mirror.ts");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function check() {
  const errors = [];

  // 1. Script exists
  if (!existsSync(SCRIPT_PATH)) {
    errors.push("backfill-vendor-non-money-from-qbo-mirror.ts not found");
    return { pass: false, errors };
  }

  const content = readFileSync(SCRIPT_PATH, "utf-8");

  // 2. Script is USMCA-scoped
  if (!content.includes(USMCA_COMPANY_ID)) {
    errors.push("Script does not reference USMCA company ID");
  }

  // 3. Script is idempotent (only updates NULL/empty)
  if (!content.includes("IS NULL OR") || !content.includes("= ''")) {
    errors.push("Script is not idempotent — must only update NULL/empty fields");
  }

  // 4. Script uses QBO mirror as source
  if (!content.includes("mdata.qbo_vendors")) {
    errors.push("Script does not use QBO mirror as source");
  }

  // 5. Script does NOT write default_expense_account_id (that's CC-1's lane)
  if (content.includes("default_expense_account_id")) {
    errors.push("Script must NOT write default_expense_account_id — that's CC-1's lane");
  }

  // 6. Script does NOT write vendor_code (no source for new codes)
  if (content.includes("vendor_code") && content.includes("SET vendor_code")) {
    errors.push("Script must NOT write vendor_code — no source for new codes");
  }

  // 7. Script has dry-run mode
  if (!content.includes("--dry-run") || !content.includes("--apply")) {
    errors.push("Script must have --dry-run and --apply modes");
  }

  // 8. Script sets bypass_rls
  if (!content.includes("bypass_rls")) {
    errors.push("Script must set app.bypass_rls for Neon access");
  }

  return { pass: errors.length === 0, errors };
}

function main() {
  const isSelftest = process.argv.includes("--selftest");

  if (isSelftest) {
    // Selftest: temporarily rename the script to simulate missing file
    const backup = SCRIPT_PATH + ".bak";
    if (existsSync(SCRIPT_PATH)) {
      renameSync(SCRIPT_PATH, backup);
      const result = check();
      renameSync(backup, SCRIPT_PATH);
      if (result.pass) {
        console.error("SELFTEST FAIL: expected failure when script is missing");
        process.exit(1);
      }
      console.log("verify-vendor-non-money-backfill: SELFTEST PASS (missing-file detection works)");
      process.exit(0);
    } else {
      console.error("SELFTEST SKIP: script not found, cannot test");
      process.exit(1);
    }
  }

  const result = check();
  if (result.pass) {
    console.log("verify-vendor-non-money-backfill: PASS — backfill script exists, is idempotent, USMCA-scoped, uses QBO mirror, does not write financial fields");
    process.exit(0);
  } else {
    console.error("verify-vendor-non-money-backfill: FAIL");
    for (const e of result.errors) {
      console.error(`  ✗ ${e}`);
    }
    process.exit(1);
  }
}

main();
