#!/usr/bin/env node
/** ACCT-TIEOUT-01 — TMS TB balanced AND read-only tie to QBO comparative. No TMS→QBO write-back. */
import { fail, requireDb } from "./_lib.mjs";

export const EXPECTED = { debits_equal_credits: true, qbo_comparative: "read_only", tolerance_cents: 0 };

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

requireDb();
fail("ACCT-TIEOUT-01 TB vs QBO comparative auto_check not yet green (empty≠PASS)");
