#!/usr/bin/env node
/** VEND-TIEOUT-01 — sum of open bills == AP control, tolerance 0. */
import { fail, requireDb } from "./_lib.mjs";

export const EXPECTED = { open_bills_eq_ap_control: true, tolerance_cents: 0 };

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

requireDb();
fail("VEND-TIEOUT-01 AP aging vs AP control not yet green (empty≠PASS)");
