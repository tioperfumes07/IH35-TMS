#!/usr/bin/env tsx
/**
 * Fire revrec Event 2 (bill) for stranded USMCA invoices 13571 ($4,900) + 13574 ($4,400).
 *
 * Measured 2026-09-24: ledger.ar_tieout variance = −$9,300 and ledger.posted_without_posting = 2
 * are exactly these two sent invoices with zero journal_entry_postings. Invoice GL poster correctly
 * refuses (INVOICE_REVREC_LATCH_OWNS_LOAD) — A/R belongs to latch Event 2 (DR A/R / CR Unbilled).
 * Bulk/send path never fired Event 2 for these loads.
 *
 * Does NOT touch banking. Owner matches bank separately.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/fire-revrec-bill-13571-13574.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/fire-revrec-bill-13571-13574.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { postLoadRevenueLatch } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";
import { resolveRoleAccountOptional } from "../../apps/backend/src/accounting/coa-roles/resolver.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DISPLAY_IDS = ["13571", "13574"];
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function arVariance(c: { query: Function }) {
  const arId = await resolveRoleAccountOptional(c as never, USMCA, "ar_control");
  if (!arId) return { gl: null, sub: null, var: null };
  const gl = await c.query(
    `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS cents
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
      WHERE p.operating_company_id=$1::uuid AND p.account_id=$2::uuid
        AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false`,
    [USMCA, arId]
  );
  const sub = await c.query(
    `SELECT COALESCE(SUM(amount_open_cents),0)::text AS cents
       FROM accounting.invoices
      WHERE operating_company_id=$1::uuid AND voided_at IS NULL
        AND status NOT IN ('draft','proforma') AND COALESCE(is_sample_data,false)=false`,
    [USMCA]
  );
  const g = Number(gl.rows[0].cents);
  const s = Number(sub.rows[0].cents);
  return { gl: g, sub: s, var: g - s };
}

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);

    const before = await arVariance(c);
    console.log("AR before", before);

    const rows = await c.query<{
      id: string;
      display_id: string;
      load_id: string;
      open_amt: string;
      has_invoice_postings: boolean;
      has_bill_latch: boolean;
      has_earn_latch: boolean;
    }>(
      `SELECT i.id::text, i.display_id, i.source_load_id::text AS load_id,
              (i.amount_open_cents::float8/100)::text AS open_amt,
              EXISTS (
                SELECT 1 FROM accounting.journal_entry_postings p
                 WHERE p.source_transaction_type='invoice'
                   AND p.source_transaction_id=i.id::text
              ) AS has_invoice_postings,
              EXISTS (
                SELECT 1 FROM accounting.load_revenue_recognition_postings r
                 WHERE r.operating_company_id=i.operating_company_id
                   AND r.load_id=i.source_load_id AND r.event='bill'
                   AND r.voided_at IS NULL AND COALESCE(r.is_active,true)
              ) AS has_bill_latch,
              EXISTS (
                SELECT 1 FROM accounting.load_revenue_recognition_postings r
                 WHERE r.operating_company_id=i.operating_company_id
                   AND r.load_id=i.source_load_id AND r.event='earn'
                   AND r.voided_at IS NULL AND COALESCE(r.is_active,true)
              ) AS has_earn_latch
         FROM accounting.invoices i
        WHERE i.operating_company_id=$1::uuid
          AND i.display_id = ANY($2::text[])
          AND i.voided_at IS NULL
        ORDER BY i.display_id`,
      [USMCA, DISPLAY_IDS]
    );

    for (const r of rows.rows) {
      console.log(
        `PRE ${r.display_id} open=$${r.open_amt} earn=${r.has_earn_latch} bill=${r.has_bill_latch} inv_postings=${r.has_invoice_postings}`
      );
      if (r.has_bill_latch) {
        console.log(`SKIP ${r.display_id} — bill latch already standing`);
        continue;
      }
      if (!APPLY) {
        console.log(
          `DRY would fire earn${!r.has_earn_latch ? "" : "(skip)"}+bill for ${r.display_id} load=${r.load_id}`
        );
        continue;
      }
      if (!r.has_earn_latch) {
        const earn = await postLoadRevenueLatch({
          operating_company_id: USMCA,
          load_id: r.load_id,
          target_status: "delivered_pending_docs",
          entry_date_iso: new Date().toISOString().slice(0, 10),
          actor_user_id: OWNER,
        });
        console.log(`EARN ${r.display_id}`, JSON.stringify(earn));
      }
      const outcome = await postLoadRevenueLatch({
        operating_company_id: USMCA,
        load_id: r.load_id,
        target_status: "completed_docs_received",
        entry_date_iso: new Date().toISOString().slice(0, 10),
        actor_user_id: OWNER,
      });
      console.log(`BILL ${r.display_id}`, JSON.stringify(outcome));
    }

    const after = await arVariance(c);
    console.log("AR after", after);

    const unposted = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM accounting.invoices i
        WHERE i.operating_company_id=$1::uuid AND i.source_system='tms' AND i.voided_at IS NULL
          AND i.status IN ('sent','partial','paid') AND COALESCE(i.is_sample_data,false)=false
          AND NOT EXISTS (
            SELECT 1 FROM accounting.journal_entry_postings p
             WHERE p.source_transaction_type='invoice' AND p.source_transaction_id=i.id::text
          )
          AND NOT EXISTS (
            SELECT 1 FROM accounting.load_revenue_recognition_postings r
             WHERE r.operating_company_id=i.operating_company_id
               AND r.load_id=i.source_load_id AND r.event='bill'
               AND r.voided_at IS NULL AND COALESCE(r.is_active,true)
          )`,
      [USMCA]
    );
    console.log("still_missing_ar_recognition", unposted.rows[0].n);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
