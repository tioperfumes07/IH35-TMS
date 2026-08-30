#!/usr/bin/env node
/** BANK-TIEOUT-01 — each live bank_account closing == ledger_account_id GL, incl Faro 1296. */
import { fail, requireDb } from "./_lib.mjs";

export const EXPECTED = { mode: "ledger_equals_bank", include_faro_1296: true, tolerance_cents: 0 };

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

requireDb();
fail("BANK-TIEOUT-01 not yet executed against per-account bank statements (empty≠PASS)");
