// LEAD 443.147 (owner 2026-10-16 10:07 CT): AR invoice 151 to GTM America LLC, dated 2026-10-13, ONE line — line haul
// 4,600.00 (type 'other' on the line-haul income account, Lead ruling (A)), memo 'Load hauled by 2 EMS — invoiced by USMCA'. No load link (not a USMCA load), no Faro purchase.
// Engines: customer — the POST /customers writer's insert + audit + spine event (QBO push NOT enqueued: USMCA QBO is out
// of scope); invoice — createExpandedInvoice → createInvoiceLineInClientTx → sendDraftInvoice(historical_backfill, the
// ROUND 290 load-less path with a named owner source document; no customer e-mail). Refuses unless the issued invoice
// totals 460000, TB nets 0, and no factoring status moved.
//   default DRY RUN (rolled back) · --apply (prod: assertIsIntendedProduction)
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { createExpandedInvoice } from "../../apps/backend/src/accounting/invoices.service.ts";
import { createInvoiceLineInClientTx } from "../../apps/backend/src/accounting/invoice-line-create.ts";
import { sendDraftInvoice } from "../../apps/backend/src/accounting/invoice-send.service.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";
import { emitMasterDataCreatedSpineEvent } from "../../apps/backend/src/mdata/master-data-spine-emit.ts";
// Production authority (verify-no-unauthorized-production-write): --apply needs --auth AUTH-NNN (checked by
// scripts/verify-owner-authorization.mjs) or the owner order this round ran under (OWNER-ORDER-<round>, relayed by Lead).
{
  const i = process.argv.indexOf("--auth");
  const a = i > 0 ? process.argv[i + 1] ?? "" : "";
  if (process.argv.includes("--apply")) {
    if (/^AUTH-\d+$/.test(a)) (await import("node:child_process")).execFileSync("node", ["scripts/verify-owner-authorization.mjs", a], { stdio: "inherit" });
    else if (!/^OWNER-ORDER-443\.\d+$/.test(a)) throw new Error("--apply requires --auth AUTH-NNN | OWNER-ORDER-443.<round>");
  }
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const MEMO = "Load hauled by 2 EMS — invoiced by USMCA";
// Lead ruling 443.147 option (A): ONE line of type 'other' on the line-haul income account (4000 Freight / Line-haul Income —
// the account all 149 live USMCA line-haul lines post to), because a 'linehaul' line requires a USMCA load.
const LINEHAUL_INCOME = "d9ad7748-8811-4bbc-af32-ec3fed76ef09";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.147 GTM invoice 151" });
const one = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, any>;
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const tb0 = await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net, count(*)::int n FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]);
  const fs0 = (await one(`SELECT md5(string_agg(id::text||COALESCE(factoring_status,''),',' ORDER BY id)) m FROM accounting.invoices WHERE operating_company_id=$1::uuid`, [USMCA])).m;
  if ((await db.query(`SELECT 1 FROM accounting.invoices WHERE operating_company_id=$1::uuid AND display_id='151' AND voided_at IS NULL`, [USMCA])).rows.length) throw new Error("REFUSE: invoice 151 already exists");

  let cust = await one(`SELECT id::text FROM mdata.customers WHERE operating_company_id=$1::uuid AND lower(customer_name)=lower('GTM America LLC') AND deactivated_at IS NULL`, [USMCA]);
  if (!cust) {
    cust = await one(
      `INSERT INTO mdata.customers (customer_name, customer_type, status, operating_company_id, created_by_user_id, updated_by_user_id)
       VALUES ('GTM America LLC', 'broker', 'active', $1::uuid, $2::uuid, $2::uuid) RETURNING id::text, customer_name`, [USMCA, OWNER]);
    await appendCrudAudit(db as never, OWNER, "mdata.customers.created", { resource_id: cust.id, resource_type: "mdata.customers", id: cust.id, name: "GTM America LLC", reason: "Lead 443.147" }, "info", "BT-1-CUSTOMER-FULL-PROFILE");
    await emitMasterDataCreatedSpineEvent(db as never, { operating_company_id: USMCA, actor_user_id: OWNER, subject_type: "customer", subject_id: cust.id, payload: { customer_code: null, name: "GTM America LLC" } } as never);
    console.log(`customer created: GTM America LLC ${cust.id}`);
  } else console.log(`customer exists: ${cust.id}`);

  const inv = await createExpandedInvoice(db as never, {
    operatingCompanyId: USMCA, userId: OWNER, invoiceType: "manual", customerId: cust.id, billToEntityType: "customer", billToEntityId: cust.id,
    issueDate: "2026-10-13", requestedDisplayId: "151", internalNotes: MEMO, customerNotes: MEMO,
  });
  const invoiceId = String((inv as Record<string, any>).id ?? (inv as Record<string, any>).invoice?.id);
  await createInvoiceLineInClientTx(db, { operatingCompanyId: USMCA, invoiceId, line_type: "other", description: `Line haul — ${MEMO}`, quantity: 1, unit_amount_cents: 460000, account_id: LINEHAUL_INCOME }, OWNER);
  const sent = await sendDraftInvoice(db as never, {
    invoiceId, operatingCompanyId: USMCA, userId: OWNER, mode: "historical_backfill",
    manualEvidence: { source: "owner_source_document", documentRef: "Owner 2026-10-16 10:07 CT (Lead 443.147): invoice 151 submitted to Faro 2026-10-13; load hauled by 2 EMS" },
  });
  if (!(sent as { ok: boolean }).ok) throw new Error(`REFUSE: send refused ${JSON.stringify(sent).slice(0, 300)}`);
  const r = await one(`SELECT i.id::text, i.display_id, i.status::text, i.issue_date::text, i.total_cents::int total, i.factoring_status, i.source_load_id, c.customer_name, i.customer_notes,
      (SELECT count(*)::int FROM accounting.invoice_lines x WHERE x.invoice_id=i.id) lines,
      (SELECT string_agg(DISTINCT p.journal_entry_uuid::text, ',') FROM accounting.journal_entry_postings p WHERE p.source_transaction_type='invoice' AND p.source_transaction_id=i.id::text) je
    FROM accounting.invoices i JOIN mdata.customers c ON c.id=i.customer_id WHERE i.id=$1::uuid`, [invoiceId]);
  console.log(JSON.stringify(r));
  const tb1 = await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net, count(*)::int n FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]);
  const fs1 = (await one(`SELECT md5(string_agg(id::text||COALESCE(factoring_status,''),',' ORDER BY id)) m FROM accounting.invoices WHERE operating_company_id=$1::uuid AND id <> $2::uuid`, [USMCA, invoiceId])).m;
  console.log(`trial balance ${tb0.net} -> ${tb1.net}; postings ${tb0.n} -> ${tb1.n}`);
  if (r.total !== 460000 || r.status !== "sent" || r.source_load_id || Number(tb1.net) !== 0 || fs1 !== fs0) throw new Error("REFUSE: read-back failed");
  await db.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
