// AUTH-097 — ROUND 155.12 FIX 4: void-and-remint the 2 orphaned $0.00 driver bills (13618, 13621).
// Both loads already carry real miles_shortest AND an active driver_finance.driver_pay_rates row
// (confirmed live: 0.48/mi, short_miles basis, no deadhead on either load) — the $0 is stale, not
// a genuine pricing gap. Root cause found live: an EARLIER, unrelated cleanup voided both bills'
// settlement_lines (real voided_at timestamps, 2026-09-28T03:28:19Z) without ever touching the
// parent driver_bills row, orphaning it at open/$0 with nothing live pointing at it.
// correctOpenDriverBillMileage's own guard used to require at least one LIVE line to exist before
// it would correct a bill — fixed in the same PR to recognize this orphaned-but-fully-voided state
// as equally safe to correct (there is nothing approved left to protect either way).
// Per the order: "Do not UPDATE the existing rows" — this voids the old bill and mints ONE new
// replacement bill + its settlement lines, in the same transaction, never a raw UPDATE of the old
// row's dollar figures.
import { register } from "tsx/esm/api";
register();
const { withCurrentUser } = await import("../../apps/backend/src/auth/db.ts");
const { setScopedCompanyContext } = await import("../../apps/backend/src/_helpers/scoped-company-context.ts");
const { correctOpenDriverBillMileage } = await import("../../apps/backend/src/driver-finance/void-open-driver-bill.service.ts");

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const TARGETS = [
  { loadNumber: "13618", milesBasis: 1348.0 },
  { loadNumber: "13621", milesBasis: 1958.9 },
];

async function main() {
  for (const t of TARGETS) {
    const result = await withCurrentUser(OWNER, async (client) => {
      await setScopedCompanyContext(client, OWNER, USMCA);
      const loadRes = await client.query(
        `SELECT id::text FROM mdata.loads WHERE load_number = $1 AND operating_company_id = $2::uuid`,
        [t.loadNumber, USMCA]
      );
      const loadId = loadRes.rows[0]?.id;
      if (!loadId) return { skipped: "load not found" };

      const ratePerMileCents = 48;
      const loadedPayCents = Math.round(t.milesBasis * ratePerMileCents);

      return correctOpenDriverBillMileage(client, {
        operatingCompanyId: USMCA,
        loadId,
        loadNumber: t.loadNumber,
        actorUserId: OWNER,
        reason:
          "ROUND 155.12 FIX 4: void-and-remint an orphaned $0 bill whose settlement_lines were " +
          "already voided by an unrelated earlier cleanup without ever updating this bill. Real " +
          "miles_shortest and an active driver pay rate both exist; pricing this correctly.",
        milesBasis: t.milesBasis,
        ratePerMileCents,
        loadedPayCents,
        milesDeadhead: null,
        rateEmptyPerMileCents: null,
        deadheadPayCents: 0,
        isSampleData: false,
      });
    });
    console.log(`${t.loadNumber}: ${JSON.stringify(result)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
