#!/usr/bin/env node
/** DISP-TIEOUT-01 — every delivered load maps to invoiced revenue; zero orphans both ways. */
import { fail, requireDb } from "./_lib.mjs";

export const EXPECTED = { delivered_load_invoice_orphans: 0, invoice_without_delivered_load: 0 };

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

requireDb();
fail("DISP-TIEOUT-01 delivered↔invoice orphan check not yet green (empty≠PASS)");
