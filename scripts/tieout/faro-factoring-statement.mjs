#!/usr/bin/env node
/**
 * FACT-TIEOUT-01 — Faro Capital statement 2026-08-10..2026-08-28 vs TMS.
 * Empty / missing DB is never PASS.
 */
import { fail, requireDb, unverified } from "./_lib.mjs";

export const EXPECTED = {
  face_cents: 9507500,
  reserve_cents: 142613,
  fee_cents: 142613,
  wire_cents: 12000,
  cash_cents: 9210274,
  ar_cents: 9507500,
  escrow_cents: 142613,
  cash_reserve_cents: 500000,
  nfe_cents: 8864887,
};

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

requireDb();
fail(
  "Faro 33-invoice cohort not yet on USMCA books at expected cents " +
    JSON.stringify(EXPECTED) +
    " — auto_check stays FAIL until CC-1 invoices + CC-2 007 grade land (R2 empty≠PASS)"
);
