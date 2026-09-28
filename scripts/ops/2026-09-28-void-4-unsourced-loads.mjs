// AUTH-093 — ROUND 155.20 JOB 1: void the 4 of the 18 "155.2" loads that have NO source document
// anywhere in ~/Downloads. Exhaustively checked: WO number as a literal string in every one of the
// 254 PDFs in Downloads (not just filename-pattern matches), AND every filename. Zero matches for
// 13623 (WO 568871), 13625 (WO LGMX142), 13627 (WO 21868). 13638's only WO-string ("56713") hits
// are substring matches inside OTHER, unrelated, older settlement PDFs' trailer number
// (FB-56713) -- confirmed a false positive, not a rate con for this load. The other 14 of the 18
// were independently re-verified: their own WO number AND customer name both appear together in
// their own dedicated rate-con PDF.
import { register } from "tsx/esm/api";
register();
const { withCurrentUser } = await import("../../apps/backend/src/auth/db.ts");
const { setScopedCompanyContext } = await import("../../apps/backend/src/_helpers/scoped-company-context.ts");
const { cancelLoadInClientTx } = await import("../../apps/backend/src/dispatch/cancellation.service.ts");

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBERS = ["13623", "13625", "13627", "13638"];

async function main() {
  for (const ln of LOAD_NUMBERS) {
    try {
      const result = await withCurrentUser(OWNER, async (client) => {
        await setScopedCompanyContext(client, OWNER, USMCA);
        const idRes = await client.query(
          `SELECT id::text FROM mdata.loads WHERE load_number = $1 AND operating_company_id = $2::uuid`,
          [ln, USMCA]
        );
        const loadId = idRes.rows[0]?.id;
        if (!loadId) return { skipped: "load not found" };
        return cancelLoadInClientTx(client, OWNER, "Owner", {
          operating_company_id: USMCA,
          load_id: loadId,
          reason_code: "OTHER",
          cancellation_notes:
            "ROUND 155.20 JOB 1 (owner order 2026-09-28): no source document, booked in error. " +
            "Exhaustively searched every PDF and filename in Downloads for this load's own work " +
            "order number — zero real matches. Never proven against a rate con or an AlwaysTrack " +
            "row. Voided, not deleted.",
          billable_to_customer: false,
        });
      });
      console.log(`${ln}: ${JSON.stringify(result)}`);
    } catch (err) {
      console.log(`${ln}: ERROR ${err?.message ?? err}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
