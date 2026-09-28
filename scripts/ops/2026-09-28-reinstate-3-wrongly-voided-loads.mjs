// AUTH-095 — ROUND 155.26 correction: 13625, 13627, 13638 were wrongly voided under AUTH-093
// (ROUND 155.20 JOB 1, "no source document in Downloads"). The owner's AlwaysTrack ground-truth
// table (ROUND 155.26) proves all three ARE real, live, open loads — AlwaysTrack is the primary
// control and it disagrees with the Downloads-only check. Reinstating operational status.
// 13623 is NOT reinstated: it does not appear anywhere in the AlwaysTrack ground-truth table
// either (independently confirmed), so both controls agree it stays voided.
//
// dispatch.load_cancellations is left EXACTLY as-is (void-not-delete/never-delete-history) — the
// mistaken cancellation stays a real, permanent, visible record. This script only restores live
// operational state and logs a new audit event explaining the reversal; it never erases the
// original cancellation record.
//
// Verified before writing: none of these 3 loads ever had a driver_finance.driver_bills row (all
// three were in the P1 "refused_no_shortest_miles" set from AUTH-090 — the cancellation cascade
// had nothing to void there). Only dispatch.trailer_interchanges on 13627 (the 21868 broker
// trailer) needs un-voiding; 13625/13638 never had one.
//
// AUTH-095 (docs/bus/OWNER-AUTHORIZATIONS.md). Requires OWNER_AUTH_ID=AUTH-095 in the environment;
// scripts/verify-owner-authorization.mjs is run separately before this script, per ROUND 133.
import { register } from "tsx/esm/api";
register();
const { withCurrentUser } = await import("../../apps/backend/src/auth/db.ts");
const { setScopedCompanyContext } = await import("../../apps/backend/src/_helpers/scoped-company-context.ts");
const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.ts");

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBERS = ["13625", "13627", "13638"];
const INTERCHANGE_ID_13627 = "c5186aa8-1fc9-4d74-882a-87883c3658d0";

async function main() {
  for (const ln of LOAD_NUMBERS) {
    const result = await withCurrentUser(OWNER, async (client) => {
      await setScopedCompanyContext(client, OWNER, USMCA);
      const loadRes = await client.query(
        `UPDATE mdata.loads SET status = 'dispatched', updated_at = now()
          WHERE load_number = $1 AND operating_company_id = $2::uuid AND status = 'cancelled'
          RETURNING id::text, status`,
        [ln, USMCA]
      );
      const load = loadRes.rows[0];
      if (!load) return { skipped: "not in cancelled status" };
      await appendCrudAudit(
        client,
        OWNER,
        "dispatch.load.cancellation_reversed",
        {
          load_id: load.id,
          load_number: ln,
          operating_company_id: USMCA,
          reason:
            "ROUND 155.26: AlwaysTrack (the owner's primary control) confirms this load is real " +
            "and currently open/live — the AUTH-093 cancellation (based on a Downloads-only " +
            "source-document check) was wrong. Reinstated to 'dispatched'. The original " +
            "cancellation record stays on file as history; it is not deleted.",
        },
        "warning",
        "ROUND-155.26"
      );
      return { reinstated: true, load_id: load.id };
    });
    console.log(`${ln}: ${JSON.stringify(result)}`);
  }

  // Un-void the 13627 trailer interchange (21868). 13625/13638 have none.
  const tiResult = await withCurrentUser(OWNER, async (client) => {
    await setScopedCompanyContext(client, OWNER, USMCA);
    const res = await client.query(
      `UPDATE dispatch.trailer_interchanges
          SET voided_at = NULL, void_reason = NULL, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        RETURNING id::text`,
      [INTERCHANGE_ID_13627, USMCA]
    );
    return res.rows[0] ? { unvoided: true } : { skipped: "not found or not voided" };
  });
  console.log(`13627 trailer_interchange: ${JSON.stringify(tiResult)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
