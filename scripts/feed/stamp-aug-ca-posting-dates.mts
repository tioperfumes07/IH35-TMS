#!/usr/bin/env tsx
import { editDriverAdvancePostingDate } from "../../apps/backend/src/cash-advances/cash-advance-disburse.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
/** AlwaysTrack deduction dates (source of truth for historical_backfill posting_date). */
const DATES: Record<string, string> = {
  "13502": "2026-08-01",
  "13516": "2026-08-05",
  "13524": "2026-08-15",
  "13531": "2026-08-18",
  "13549": "2026-08-24",
  "13546": "2026-08-25",
  "13567": "2026-09-03",
};

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const rows = await c.query<{ id: string; load_number: string }>(
      `SELECT a.id::text, l.load_number FROM driver_finance.driver_advances a
         JOIN mdata.loads l ON l.id = a.load_id
        WHERE a.operating_company_id=$1::uuid AND a.voided_at IS NULL AND a.posting_date IS NULL`,
      [USMCA]
    );
    for (const r of rows.rows) {
      const d = DATES[r.load_number];
      if (!d) {
        console.log("SKIP no date", r.load_number);
        continue;
      }
      const res = await editDriverAdvancePostingDate(OWNER, "Owner", USMCA, {
        advance_id: r.id,
        posting_date: d,
      });
      console.log(r.load_number, d, JSON.stringify(res));
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
