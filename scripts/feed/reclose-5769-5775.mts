import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { closeFedSettlementIfRequested } from "../../apps/backend/src/feed/ensure-settlement-from-fed-bills.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  for (const doc of ["5769", "5775"] as const) {
    const id = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const r = await c.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.driver_settlements
          WHERE operating_company_id=$1::uuid AND source_document_ref=$2 AND voided_at IS NULL LIMIT 1`,
        [USMCA, doc]
      );
      return r.rows[0]!.id;
    });
    const r = await closeFedSettlementIfRequested({
      operatingCompanyId: USMCA,
      actorUserId: OWNER,
      settlementId: id,
      documentNumber: doc,
      close: true,
    });
    console.log(doc, r);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
