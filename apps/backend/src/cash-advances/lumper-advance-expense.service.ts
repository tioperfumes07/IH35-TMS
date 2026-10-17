/**
 * LEAD 443.128 A (G15 + BCF-06) — a lumper paid as a driver cash advance is a COMPANY LOAD EXPENSE, not driver debt.
 * cash-advance-create.ts recorded it with "expense posting HOLD" and nothing ever booked the lumper: the disbursement debits the
 * driver's own advance account (Dr 1245-xx / Cr 2170), so the settlement close would have recovered the lumper from the driver.
 *
 * At disbursement (same transaction as the advance's own posting) this writes the lumper expense document on the load through
 * THE shared expense writer (accounting/expense-writer.service.ts): driver / unit / trailer from the load (443.128 B), the
 * lumper item and its account (Dr), Cr the very account the advance debited — the advance is consumed by the expense, so
 * the driver owes nothing for it. When the lumper is billable to the customer (the stop's lumper_billable, else the
 * customer's lumper_billing_mode — lumper-auto-invoice.ts shouldBillLumperToCustomer), the expense line names the customer and
 * the lumper becomes an invoice line on the load's DRAFT invoice through THE invoice-line writer (invoice-line-create.ts);
 * when the load's invoice is already issued, on a new draft invoice for that load and customer (never on a sent invoice;
 * A/R posts when the office sends it). Idempotent per advance.
 */
import { createExpenseInClientTx, type CreateExpenseBody } from "../accounting/expense-writer.service.js";
import { createInvoiceLineInClientTx } from "../accounting/invoice-line-create.js";
import { resolveInvoiceLineItemId } from "../accounting/invoice-charge-lines.js";
import { createExpandedInvoice } from "../accounting/invoices.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { shouldBillLumperToCustomer, type CustomerLumperBillingMode } from "./lumper-auto-invoice.js";

/** The lumper item the expense names (its default expense account is the lumper expense account, 5310 on USMCA). */
export const LUMPER_EXPENSE_ITEM_NAME = "Warehouse Lumper Expense";

export class LumperAdvanceExpenseError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "LumperAdvanceExpenseError";
  }
}

export type LumperAdvanceExpenseResult =
  | { recorded: false; reason: "not_a_lumper" | "already_recorded"; expense_id?: string }
  | { recorded: true; expense_id: string; journal_entry_id: string | null; billable: boolean; invoice_id: string | null; invoice_line_id: string | null };

/** The memo is the per-advance identity of its lumper expense (and the writer's double-submit key). */
export const lumperExpenseMemo = (advanceDisplayId: string) => `Lumper paid by cash advance ${advanceDisplayId}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordLumperAdvanceExpenseInClientTx(client: any, input: { operatingCompanyId: string; advanceId: string; actorUserId: string }): Promise<LumperAdvanceExpenseResult> {
  const opco = input.operatingCompanyId;
  const adv = (await client.query(
    `SELECT a.id::text, a.display_id, a.purpose::text AS purpose, a.load_id::text AS load_id, a.driver_id::text AS driver_id,
            round(a.amount * 100)::bigint::text AS amount_cents, COALESCE(a.posting_date, CURRENT_DATE)::text AS posting_date
       FROM driver_finance.driver_advances a WHERE a.id = $1::uuid AND a.operating_company_id = $2::uuid FOR UPDATE`,
    [input.advanceId, opco]
  )).rows[0] as { id: string; display_id: string; purpose: string; load_id: string | null; driver_id: string | null; amount_cents: string; posting_date: string } | undefined;
  if (!adv || adv.purpose !== "lumper") return { recorded: false, reason: "not_a_lumper" };
  if (!adv.load_id) throw new LumperAdvanceExpenseError("LUMPER_ADVANCE_HAS_NO_LOAD", `Lumper advance ${adv.display_id} names no load`);
  const memo = lumperExpenseMemo(adv.display_id);
  const existing = (await client.query(
    `SELECT id::text FROM accounting.expenses WHERE operating_company_id = $1::uuid AND memo = $2 AND voided_at IS NULL LIMIT 1`,
    [opco, memo]
  )).rows[0] as { id: string } | undefined;
  if (existing) return { recorded: false, reason: "already_recorded", expense_id: existing.id };

  // Cr the account the advance's own posting debited (the driver's advance account) — read from the posted entry, never guessed.
  const debited = (await client.query(
    `SELECT DISTINCT p.account_id::text AS account_id FROM accounting.journal_entry_postings p
      WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'driver_advance' AND p.source_transaction_id::text = $2
        AND p.debit_or_credit = 'debit' AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL`,
    [opco, adv.id]
  )).rows as Array<{ account_id: string }>;
  if (debited.length !== 1) {
    throw new LumperAdvanceExpenseError("LUMPER_ADVANCE_NOT_POSTED", `Lumper advance ${adv.display_id} has ${debited.length} live advance debit account(s) — its lumper expense needs exactly one`);
  }
  const item = (await client.query(
    `SELECT id::text, default_expense_account_id::text AS account_id FROM catalogs.items
      WHERE operating_company_id = $1::uuid AND item_name = $2 AND deactivated_at IS NULL AND default_expense_account_id IS NOT NULL LIMIT 2`,
    [opco, LUMPER_EXPENSE_ITEM_NAME]
  )).rows as Array<{ id: string; account_id: string }>;
  if (item.length !== 1) {
    throw new LumperAdvanceExpenseError("LUMPER_ITEM_MISSING", `This company needs exactly one active "${LUMPER_EXPENSE_ITEM_NAME}" item with an expense account (found ${item.length})`);
  }
  const amountCents = Number(adv.amount_cents);
  const written = await createExpenseInClientTx(client, {
    operating_company_id: opco,
    category_account_id: item[0]!.account_id,
    expense_date: adv.posting_date,
    amount_cents: amountCents,
    memo,
    is_company_expense: true,
    payment_account_uuid: debited[0]!.account_id,
    load_id: adv.load_id,
    driver_id: adv.driver_id ?? undefined,
    item_id: item[0]!.id,
    quantity: 1,
    rate_cents: amountCents,
    unit_of_measure: "each",
  } as CreateExpenseBody, input.actorUserId);
  if (!("expense_id" in written) || !written.expense_id) {
    throw new LumperAdvanceExpenseError("LUMPER_EXPENSE_REFUSED", `The expense writer refused lumper advance ${adv.display_id}'s expense (${Object.keys(written)[0] ?? "refused"})`);
  }
  const expenseId = String(written.expense_id);
  const journalEntryId = (written as { posted_journal_entry_id?: string | null }).posted_journal_entry_id ?? null;

  // Billable to the customer?
  const bill = (await client.query(
    `SELECT l.customer_id::text AS customer_id, l.load_number::text AS load_number, c.lumper_billing_mode::text AS mode,
            (SELECT s.lumper_billable FROM mdata.load_stops s
              WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND (s.lumper_required OR COALESCE(s.lumper_amount_cents, 0) > 0)
              ORDER BY s.sequence_number DESC LIMIT 1) AS stop_billable
       FROM mdata.loads l LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id
      WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`,
    [adv.load_id, opco]
  )).rows[0] as { customer_id: string | null; load_number: string; mode: CustomerLumperBillingMode | null; stop_billable: boolean | null } | undefined;
  const billable = Boolean(bill?.customer_id) && shouldBillLumperToCustomer("carrier_bill", bill?.mode, bill?.stop_billable);
  let invoiceId: string | null = null;
  let invoiceLineId: string | null = null;
  if (billable && bill?.customer_id) {
    await client.query(`UPDATE accounting.expense_lines SET billable_customer_uuid = $2::uuid WHERE expense_id = $1::uuid`, [expenseId, bill.customer_id]);
    invoiceId = ((await client.query(
      `SELECT id::text FROM accounting.invoices
        WHERE operating_company_id = $1::uuid AND source_load_id = $2::uuid AND status = 'draft' AND voided_at IS NULL
        ORDER BY created_at LIMIT 1`,
      [opco, adv.load_id]
    )).rows[0] as { id: string } | undefined)?.id ?? null;
    if (!invoiceId) {
      // The load's invoice is already issued (USMCA invoices at delivery): a new DRAFT invoice for this load and customer.
      const created = await createExpandedInvoice(client, {
        operatingCompanyId: opco, userId: input.actorUserId, invoiceType: "customer_adjustment", customerId: bill.customer_id,
        billToEntityType: "customer", billToEntityId: bill.customer_id,
        internalNotes: `Lumper paid by cash advance ${adv.display_id} on load ${bill.load_number} (billable to the customer)`,
      });
      invoiceId = String(created.id);
      await client.query(`UPDATE accounting.invoices SET source_load_id = $2::uuid WHERE id = $1::uuid AND operating_company_id = $3::uuid`, [invoiceId, adv.load_id, opco]);
    }
    // The lumper revenue account from the same map the invoice-line resolver reads (category revenue / lumper), on THIS
    // transaction's client — never a second connection inside a posting transaction.
    const incomeAccount = ((await client.query(
      `SELECT account_id::text FROM accounting.expense_category_account_map
        WHERE operating_company_id = $1::uuid AND category_kind = 'revenue' AND category_code = 'lumper' AND is_active LIMIT 2`,
      [opco]
    )).rows as Array<{ account_id: string }>);
    if (incomeAccount.length !== 1) throw new LumperAdvanceExpenseError("LUMPER_REVENUE_ACCOUNT_MISSING", "No single active revenue / lumper account mapping for this company");
    const income = { account_id: incomeAccount[0]!.account_id };
    const lineItem = await resolveInvoiceLineItemId(client, opco, income.account_id, ["Warehouse-Lumper Fee", "Lumper"]);
    const line = await createInvoiceLineInClientTx(client, {
      operatingCompanyId: opco, invoiceId, line_type: "lumper", description: `Lumper fee · Load ${bill.load_number}`, quantity: 1,
      unit_amount_cents: amountCents, source_load_id: adv.load_id, account_id: income.account_id, ...(lineItem ? { item_id: lineItem } : {}),
    }, input.actorUserId);
    if (!line.ok) throw new LumperAdvanceExpenseError("LUMPER_INVOICE_LINE_REFUSED", `Lumper advance ${adv.display_id}: the invoice-line writer refused (${line.error})`);
    invoiceLineId = String((line.data.line as { id: string }).id);
  }
  await appendCrudAudit(client, input.actorUserId, "driver_finance.lumper_advance.expense_recorded", {
    operating_company_id: opco, advance_id: adv.id, display_id: adv.display_id, load_id: adv.load_id, expense_id: expenseId,
    journal_entry_id: journalEntryId, credit_account_id: debited[0]!.account_id, billable, invoice_id: invoiceId, invoice_line_id: invoiceLineId,
  }, "info", "443.128-A");
  return { recorded: true, expense_id: expenseId, journal_entry_id: journalEntryId, billable, invoice_id: invoiceId, invoice_line_id: invoiceLineId };
}
