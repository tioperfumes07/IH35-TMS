#!/usr/bin/env node
/**
 * GUARD — verify-fuel-gl-no-double-post
 *
 * STATUS: SUPERSEDED (2026-08-03). CLS-FUEL-DOUBLE-POST was refuted by GUARD.
 *
 * The premise was FALSE: the 68 "overlap" bank fuel charges are on a DIFFERENT payment
 * instrument (Business Platinum Card + WF checking) than the fuel-card poster's 1,547 rows
 * ($625,546.39 via Relay fleet card). Fuel-card swipes settle via aggregate provider invoice,
 * NOT individual bank debits — so these are separate direct purchases, not duplicates.
 *
 * The 18 "pairs" ($9,216.49) were coincidental near-amounts across different instruments.
 * GUARD reproduced: 14/$3,057 at ±$1/±3d — spurious matches.
 *
 * METHOD LESSON: never fuzzy-match amounts across DIFFERENT payment instruments and call it
 * a double-post. A duplicate must be the same instrument or a proven settlement link.
 *
 * No interlock needed. No JE reversal needed. Guard now exits 0.
 * Kept on disk for audit-trail purposes (row 673 in AUDIT-COVERAGE-LIVE.md).
 */
import { existsSync } from "node:fs";

const LABEL = "verify-fuel-gl-no-double-post";

// Verify fuel poster service still exists (basic sanity — not a defect guard).
const FUEL_POSTER = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";
if (!existsSync(FUEL_POSTER)) {
  console.error(`${LABEL}: WARN — ${FUEL_POSTER} missing (fuel poster removed?)`);
  process.exit(1);
}

console.log(`${LABEL}: PASS (CLS-FUEL-DOUBLE-POST SUPERSEDED — no double-posting exists; see row 673)`);
