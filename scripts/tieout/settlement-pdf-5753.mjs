#!/usr/bin/env node
/** SETL-TIEOUT-01 — owner settlement PDF 5753 vs TMS header+lines. */
import { fail, requireDb } from "./_lib.mjs";

export const EXPECTED = {
  source: "docs SETTLEMENT-ACCEPTANCE-REFERENCE-from-real-5753-2026-08-04.md",
  tolerance_cents: 0,
};

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

requireDb();
fail("SETL-TIEOUT-01 waiting on SETL specimen posted (empty≠PASS)");
