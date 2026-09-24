#!/usr/bin/env tsx
/**
 * Post stranded USMCA invoices 13571 ($4,900) + 13574 ($4,400) that sit status=sent
 * with zero journal_entry_postings — exactly the -$9,300 ledger.ar_tieout variance and
 * the 2-row ledger.posted_without_posting count (measured 2026-09-24).
 *
 * Does NOT touch banking. Owner matches bank separately.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/post-stranded-invoices-13571-13574.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/post-stranded-invoices-13571-13574.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { postInvoiceGlIfEnabled } from "../../apps/backend/src/accounting/invoice-gl.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DISPLAY_IDS = ["13571", "13574"];
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);

    const rows = await c.query<{
      id: string;
      display_id: string;
      status: string;
      open_amt: string;
      has_postings: boolean;
    }>(
      `SELECT i.id::text, i.display_id, i.status,
              (i.amount_open_cents::float8/100)::text AS open_amt,
              EXISTS (
                SELECT 1 FROM accounting.journal_entry_postings p
                 WHERE p.source_transaction_type='invoice'
                   AND p.source_transaction_id=i.id::text
              ) AS has_postings
         FROM accounting.invoices i
        WHERE i.operating_company_id=$1::uuid
          AND i.display_id = ANY($2::text[])
          AND i.voided_at IS NULL
        ORDER BY i.display_id`,
      [USMCA, DISPLAY_IDS]
    );

    for (const r of rows.rows) {
      console.log(
        `PRE ${r.display_id} status=${r.status} open=$${r.open_amt} has_postings=${r.has_postings}`
      );
      if (r.has_postings) {
        console.log(`SKIP ${r.display_id} — already posted`);
        continue;
      }
      if (!APPLY) {
        console.log(`DRY would postInvoiceGlIfEnabled ${r.display_id}`);
        continue;
      }
      const outcome = await postInvoiceGlIfEnabled(c as never, USMCA, r.id, {
        userId: OWNER,
      });
      console.log(`POST ${r.display_id}`, JSON.stringify(outcome));
    }

    if (APPLY) {
      const check = await c.query<{ display_id: string; n: string }>(
        `SELECT i.display_id, COUNT(p.id)::text AS n
           FROM accounting.invoices i
           LEFT JOIN accounting.journal_entry_postings p
             ON p.source_transaction_type='invoice' AND p.source_transaction_id=i.id::text
          WHERE i.operating_company_id=$1::uuid AND i.display_id = ANY($2::text[])
          GROUP BY i.display_id ORDER BY 1`,
        [USMCA, DISPLAY_IDS]
      );
      for (const r of check.rows) console.log(`PROOF ${r.display_id} posting_lines=${r.n}`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
