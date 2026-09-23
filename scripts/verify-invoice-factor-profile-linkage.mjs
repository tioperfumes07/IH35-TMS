#!/usr/bin/env node
// ROUND 124 T4 — guard for accounting.invoices.factor_profile_id (FK -> factoring.factor(id)).
//
// ROOT CAUSE (fixed this round): apps/backend/src/factoring/auto-submit-on-delivery.service.ts and
// apps/backend/src/accounting/factoring-advances.routes.ts both resolve the customer's factor via
// getFactorForCustomer() at submit time -- the value was computed and used for reserve/fee math --
// but neither ever wrote it onto the invoice header. 119/119 USMCA invoices measured NULL live
// 2026-09-23 (ROUND 124). Fixed in both write paths + a one-time backfill this same round (65/69
// resolved and written; 4 genuinely un-resolvable, left NULL and printed, never guessed).
//
// WHAT THIS GUARD CHECKS (live, br-fancy-credit-akjnd07a):
//   Every accounting.invoices row with factoring_status IN ('submitted','advanced') must have
//   factor_profile_id IS NOT NULL, UNLESS it is one of the four known-refused pre-fix rows (named
//   below by id, not a wildcard exemption -- this list can only shrink, matching the shape of every
//   other named-allowlist guard in this repo, e.g. verify-void-stamp-columns.mjs's writer allowlist).
//   A submitted/advanced invoice going forward with a NULL factor_profile_id that is NOT on this
//   list is the exact defect this round fixed -- FAIL loud, never silently skip.
//
// A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B) -- no
// ALLOW_OFFLINE_SKIP declared.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-invoice-factor-profile-linkage";

// Named, dated, reasoned -- not a wildcard. Live-measured 2026-09-23 (ROUND 124 T4 backfill run):
// these 4 invoices were 'advanced' with a customer whose factoring.customer_factor_assignment could
// not be resolved as of the advance's own submitted_at date. Ratchet: this list can only shrink (a
// future ruling backfills one by hand and removes it here), never grow silently.
const KNOWN_PRE_FIX_UNRESOLVED = new Set([
  "218a2a1d-0d94-421b-b5b3-24c3e681e581",
  "378736a1-7ae4-4e4c-8280-34a33136c906",
  "5583385b-2200-4f81-afc2-19b70b6d136f",
  "c1618066-5d65-4553-b51f-363db453af5f",
]);

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query(`SET app.bypass_rls = 'lucia'`);
    const res = await client.query(`
      SELECT id::text, operating_company_id::text, factoring_status
      FROM accounting.invoices
      WHERE factoring_status IN ('submitted', 'advanced')
        AND factor_profile_id IS NULL
    `);

    const unexpected = res.rows.filter((r) => !KNOWN_PRE_FIX_UNRESOLVED.has(r.id));

    if (unexpected.length > 0) {
      console.error(`${LABEL}: FAIL — ${unexpected.length} submitted/advanced invoice(s) with NULL factor_profile_id, not on the known pre-fix list:`);
      for (const r of unexpected) {
        console.error(`  invoice=${r.id} opco=${r.operating_company_id} factoring_status=${r.factoring_status}`);
      }
      console.error(
        `${LABEL}: this is the exact defect ROUND 124 T4 fixed (auto-submit-on-delivery.service.ts / ` +
          `factoring-advances.routes.ts must set factor_profile_id from getFactorForCustomer() at submit time).`
      );
      process.exit(1);
    }

    const stillKnownGap = res.rows.filter((r) => KNOWN_PRE_FIX_UNRESOLVED.has(r.id));
    console.log(
      `${LABEL}: OK — no new unresolved submitted/advanced invoice lacks factor_profile_id. ` +
        `${stillKnownGap.length} known pre-fix row(s) remain on the named allowlist (unchanged from ROUND 124).`
    );
    process.exit(0);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL —`, err);
  process.exit(1);
});
