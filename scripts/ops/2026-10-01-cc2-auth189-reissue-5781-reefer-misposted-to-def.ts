/**
 * AUTH-189 — reissue the three settlement-5781 expense documents (13523-27, -28, -29) whose journal
 * entries post the "Fuel-Reefer Diesel" line ($518.80 in all) to 5010 DEF while the line itself is coded
 * to 5000 Fuel & Diesel (the item's own default account, linkage law §7). Measured 2026-10-01: these 3 are
 * the ONLY posted expense lines in USMCA whose account differs from their ledger leg (544 checked).
 * Root cause: the 2026-09-30 feed inserted the reefer line on 5010 at 06:16Z, posted it, then recoded the
 * line to 5000 at 07:43Z without reposting. Migration 202615170700 makes that edit impossible.
 *
 * Void-never-delete, never UPDATE a posted money row (CC-1's R-185 pattern, scripts/ops/2026-09-26-cc1-r185-
 * repost-27-driver-paid-expenses.ts): per document, ONE transaction — reverse its posting through
 * reversePostedSourceTransactionInClientTx, void the old header, create a NEW expense with the SAME date,
 * load, vendor, payment account, memo and lines (account/item/qty/rate/amount unchanged), its
 * expense_load_links row, and post it through postSourceTransactionInClientTx. No GL math is written here.
 * Linkage: the reissue also carries the truck and driver of load 13523 (exactly one assigned unit and one
 * driver) — DEF and reefer fuel are Tier 1, and the originals had neither.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth189-reissue-5781-reefer-misposted-to-def.ts [--apply]
 * (dry run by default; --rehearse runs the apply path and rolls back; --apply gated by verify-owner-authorization.mjs AUTH-189)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
/** Runs the full apply path inside each document's transaction, then ROLLS BACK — proof before writing. */
const REHEARSE = !APPLY && process.argv.includes("--rehearse");
const AUTH_ID = "AUTH-189";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const DOCS = ["13523-27", "13523-28", "13523-29"];
const EXPECTED_MISPOSTED_CENTS = 51880;

type Line = {
  id: string; line_sequence: number; amount_cents: string; description: string | null; expense_account_uuid: string;
  item_id: string | null; quantity: string | null; rate_cents: string | null; unit_of_measure: string | null;
  line_category: string | null; leg_account: string | null;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }
  const { postSourceTransactionInClientTx, reversePostedSourceTransactionInClientTx } = await import(
    "../../apps/backend/src/accounting/posting-engine.service.js"
  );
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const { generateExpenseNumber } = await import("../../apps/backend/src/expense-attribution/expense-number.js");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let misposted = 0;
  try {
    for (const docNumber of DOCS) {
      await client.query("BEGIN");
      if (APPLY) await assertIsIntendedProduction(client);
      await client.query("SET LOCAL ROLE neondb_owner");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

      const h = (
        await client.query<{
          id: string; transaction_date: string; total_amount_cents: string; memo: string; load_id: string; vendor_uuid: string;
          payment_account_uuid: string; status: string; posting_status: string; journal_entry_id: string | null; voided_at: string | null;
          source_settlement_ref: string | null; vendor_document_number: string | null; is_company_expense: boolean | null;
          is_reimbursable: boolean | null; payment_type: string | null; load_unit: string | null; load_driver: string | null; load_driver2: string | null;
        }>(
          `SELECT e.id::text, e.transaction_date::text, e.total_amount_cents::text, e.memo, e.load_id::text, e.vendor_uuid::text,
                  e.payment_account_uuid::text, e.status, e.posting_status, e.journal_entry_id::text, e.voided_at::text,
                  e.source_settlement_ref, e.vendor_document_number, e.is_company_expense, e.is_reimbursable, e.payment_type,
                  l.assigned_unit_id::text AS load_unit, l.assigned_primary_driver_id::text AS load_driver,
                  l.assigned_secondary_driver_id::text AS load_driver2
             FROM accounting.expenses e JOIN mdata.loads l ON l.id = e.load_id
            WHERE e.operating_company_id = $1::uuid AND e.expense_number = $2`,
          [USMCA, docNumber]
        )
      ).rows;
      if (h.length !== 1) throw new Error(`STOP: ${docNumber} found ${h.length} times`);
      const doc = h[0]!;
      if (doc.voided_at || doc.status !== "posted" || doc.posting_status !== "posted" || !doc.journal_entry_id) {
        throw new Error(`STOP: ${docNumber} not in the expected posted shape (${doc.status}/${doc.posting_status}/${doc.journal_entry_id})`);
      }
      if (!doc.load_unit || !doc.load_driver || doc.load_driver2) {
        throw new Error(`STOP: ${docNumber}'s load does not name exactly one truck and one driver`);
      }
      const lines = (
        await client.query<Line>(
          `SELECT l.id::text, l.line_sequence, l.amount_cents::text, l.description, l.expense_account_uuid::text, l.item_id::text,
                  l.quantity::text, l.rate_cents::text, l.unit_of_measure, l.line_category,
                  (SELECT p.account_id::text FROM accounting.journal_entry_postings p
                    WHERE p.journal_entry_uuid = $2::uuid AND p.source_transaction_line_id::text = l.id::text AND p.debit_or_credit = 'debit' LIMIT 1) AS leg_account
             FROM accounting.expense_lines l WHERE l.expense_id = $1::uuid ORDER BY l.line_sequence`,
          [doc.id, doc.journal_entry_id]
        )
      ).rows;
      const wrong = lines.filter((l) => l.leg_account && l.leg_account !== l.expense_account_uuid);
      misposted += wrong.reduce((a, l) => a + Number(l.amount_cents), 0);
      console.log(`${docNumber}: ${lines.length} line(s), ${wrong.length} posted to a different account than the line ($${(wrong.reduce((a, l) => a + Number(l.amount_cents), 0) / 100).toFixed(2)})`);
      if (wrong.length !== 1) throw new Error(`STOP: ${docNumber} expected exactly 1 misposted line, found ${wrong.length}`);

      if (!APPLY && !REHEARSE) {
        await client.query("ROLLBACK");
        continue;
      }

      const rev = await reversePostedSourceTransactionInClientTx(
        client as never,
        { operating_company_id: USMCA, source_transaction_type: "expense", source_transaction_id: doc.id },
        { userId: ACTOR },
        new Date().toISOString().slice(0, 10)
      );
      if (!rev.journal_entry_id) throw new Error(`STOP: ${docNumber} reversal returned no journal entry`);
      const voidReason = `${AUTH_ID}: reefer diesel line posted to 5010 DEF while coded to 5000 Fuel & Diesel; reissued with its own lines`;
      await client.query(
        `UPDATE accounting.expenses
            SET status = 'void', posting_status = 'reversed', reversed_by_je_id = $2::uuid,
                voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $5::uuid`,
        [doc.id, rev.journal_entry_id, ACTOR, voidReason, USMCA]
      );
      await appendCrudAudit(client as never, ACTOR, "expense.voided", { expense_id: doc.id, reversing_journal_entry_id: rev.journal_entry_id, reason: voidReason }, "warning", `CC-2-${AUTH_ID}`);

      const numbering = await generateExpenseNumber(client as never, doc.load_id, USMCA);
      const memo = `${doc.memo} (${AUTH_ID} reissue of ${docNumber}: ledger now matches lines)`;
      const ins = await client.query<{ id: string }>(
        `INSERT INTO accounting.expenses (
           operating_company_id, status, transaction_date, total_amount_cents, memo, expense_number, load_id, is_sample_data,
           payment_account_uuid, vendor_uuid, unit_id, driver_uuid, source_settlement_ref, vendor_document_number,
           is_company_expense, is_reimbursable, payment_type, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid, 'draft', $2::date, $3::bigint, $4, $5, $6::uuid, false, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11, $12,
                 COALESCE($13, true), COALESCE($14, false), COALESCE($15, 'expense'), $16::uuid, $16::uuid)
         RETURNING id::text`,
        [USMCA, doc.transaction_date, Number(doc.total_amount_cents), memo, numbering.number, doc.load_id, doc.payment_account_uuid,
         doc.vendor_uuid, doc.load_unit, doc.load_driver, doc.source_settlement_ref, doc.vendor_document_number,
         doc.is_company_expense, doc.is_reimbursable, doc.payment_type, ACTOR]
      );
      const newId = ins.rows[0]!.id;
      await client.query(
        `INSERT INTO expense_attribution.expense_load_links (
           operating_company_id, expense_id, expense_source, load_id, load_number, expense_seq, expense_number,
           attribution_method, attribution_confidence, attribution_reason, attributed_by_user_id)
         VALUES ($1, $2, 'accounting', $3, $4, $5, $6, 'user_assigned', 'high', $7, $8)`,
        [USMCA, newId, doc.load_id, numbering.loadNumber, numbering.seq, numbering.number, `${AUTH_ID} reissue of ${docNumber}`, ACTOR]
      );
      for (const l of lines) {
        await client.query(
          `INSERT INTO accounting.expense_lines (
             operating_company_id, expense_id, line_sequence, amount, amount_cents, description, load_id, load_required,
             expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure, line_category, unit_id, driver_id)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::bigint, $6, $7::uuid, true, $8::uuid, $9::uuid, $10, $11::bigint, $12, $13, $14::uuid, $15::uuid)`,
          [USMCA, newId, l.line_sequence, Number(l.amount_cents) / 100, Number(l.amount_cents), l.description, doc.load_id,
           l.expense_account_uuid, l.item_id, l.quantity === null ? null : Number(l.quantity), l.rate_cents === null ? null : Number(l.rate_cents),
           l.unit_of_measure, l.line_category, doc.load_unit, doc.load_driver]
        );
      }
      const posted = await postSourceTransactionInClientTx(
        client as never,
        { operating_company_id: USMCA, source_transaction_type: "expense", source_transaction_id: newId },
        { userId: ACTOR }
      );
      if (!posted.journal_entry_id) throw new Error(`STOP: ${numbering.number} did not post`);
      await client.query(
        `UPDATE accounting.expenses SET status = 'posted', posting_status = 'posted', posted_at = now(), journal_entry_id = $2::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
        [newId, posted.journal_entry_id, USMCA]
      );
      const check = (
        await client.query<{ n: number }>(
          `SELECT count(*)::int n FROM accounting.expense_lines l JOIN accounting.journal_entry_postings p
              ON p.journal_entry_uuid = $2::uuid AND p.source_transaction_line_id::text = l.id::text AND p.debit_or_credit = 'debit'
            WHERE l.expense_id = $1::uuid AND p.account_id <> l.expense_account_uuid`,
          [newId, posted.journal_entry_id]
        )
      ).rows[0]!.n;
      if (check !== 0) throw new Error(`STOP: reissue ${numbering.number} still posts ${check} line(s) to another account — rolled back`);
      await appendCrudAudit(
        client as never, ACTOR, "accounting.expenses.created",
        { resource_type: "accounting.expenses", resource_id: newId, expense_number: numbering.number, reissue_of_expense_id: doc.id,
          reissue_of_expense_number: docNumber, journal_entry_id: posted.journal_entry_id, reversing_journal_entry_id: rev.journal_entry_id,
          unit_id: doc.load_unit, driver_id: doc.load_driver },
        "info", `CC-2-${AUTH_ID}`
      );
      if (REHEARSE) {
        await client.query("ROLLBACK");
        console.log(`  REHEARSED (rolled back) ${docNumber} -> ${numbering.number}: reversal + new entry posted, every line on its own account`);
        continue;
      }
      await client.query("COMMIT");
      console.log(`  APPLIED ${docNumber} -> ${numbering.number}: reversal ${rev.journal_entry_id}, new entry ${posted.journal_entry_id}`);
    }
    if (misposted !== EXPECTED_MISPOSTED_CENTS) throw new Error(`STOP: misposted total ${misposted} cents, expected ${EXPECTED_MISPOSTED_CENTS}`);
    console.log(APPLY ? `DONE under ${AUTH_ID}: ${DOCS.length} documents reissued, $${(misposted / 100).toFixed(2)} now on 5000.` : REHEARSE ? `REHEARSAL complete, nothing written: ${DOCS.length} documents, $${(misposted / 100).toFixed(2)} would move 5010 -> 5000.` : `DRY RUN: ${DOCS.length} documents, $${(misposted / 100).toFixed(2)} misposted to 5010. Re-run with --apply.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
