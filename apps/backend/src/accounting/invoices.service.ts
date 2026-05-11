import { appendCrudAudit } from "../audit/crud-audit.js";
import { nextInvoiceDisplayId } from "./display-id.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type ExpandedInvoiceInput = {
  operatingCompanyId: string;
  userId: string;
  invoiceType: "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual";
  customerId: string;
  billToEntityType: "customer" | "driver" | "vendor" | "other";
  billToEntityId: string | null;
  issueDate?: string;
  dueDate?: string;
  internalNotes?: string;
  customerNotes?: string;
  autoDeductSettlement?: boolean;
};

export async function createExpandedInvoice(client: DbClient, input: ExpandedInvoiceInput) {
  const customerRes = await client.query<{
    id: string;
    payment_terms_id: string | null;
    ar_email: string | null;
    ar_phone: string | null;
    terms_name: string | null;
    days_until_due: string | null;
  }>(
    `
      SELECT c.id, c.payment_terms_id, c.ar_email, c.ar_phone, pt.terms_name, pt.days_until_due::text
      FROM mdata.customers c
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
      WHERE c.id = $1
        AND c.operating_company_id = $2
      LIMIT 1
    `,
    [input.customerId, input.operatingCompanyId]
  );
  const customer = customerRes.rows[0];
  if (!customer) throw new Error("customer_not_found");

  const issueDate = input.issueDate ?? new Date().toISOString().slice(0, 10);
  const termsDays = Number(customer.days_until_due ?? 30);
  const dueDate =
    input.dueDate ?? new Date(new Date(`${issueDate}T00:00:00.000Z`).getTime() + termsDays * 86400000).toISOString().slice(0, 10);
  const displayId = await nextInvoiceDisplayId(client, input.operatingCompanyId, new Date(`${issueDate}T00:00:00.000Z`));
  const insertRes = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.invoices (
        operating_company_id,
        customer_id,
        display_id,
        status,
        issue_date,
        due_date,
        payment_terms_id,
        payment_terms_label,
        payment_terms_days,
        ar_email_snapshot,
        ar_phone_snapshot,
        internal_notes,
        customer_notes,
        currency_code,
        created_by_user_id,
        updated_by_user_id,
        invoice_type,
        bill_to_entity_type,
        bill_to_entity_id,
        auto_deduct_settlement
      ) VALUES (
        $1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,'USD',$13,$13,$14,$15,$16,$17
      )
      RETURNING id
    `,
    [
      input.operatingCompanyId,
      input.customerId,
      displayId,
      issueDate,
      dueDate,
      customer.payment_terms_id,
      customer.terms_name,
      termsDays,
      customer.ar_email,
      customer.ar_phone,
      input.internalNotes ?? null,
      input.customerNotes ?? null,
      input.userId,
      input.invoiceType,
      input.billToEntityType,
      input.billToEntityId,
      Boolean(input.autoDeductSettlement),
    ]
  );
  const invoiceId = insertRes.rows[0]?.id;
  if (!invoiceId) throw new Error("invoice_create_failed");

  const eventByType: Record<ExpandedInvoiceInput["invoiceType"], string> = {
    driver_damage: "accounting.driver_charge.created",
    driver_misc: "accounting.driver_charge.created",
    vendor_chargeback: "accounting.vendor_chargeback.created",
    customer_adjustment: "accounting.customer_adjustment.created",
    manual: "accounting.manual_invoice.created",
  };
  await appendCrudAudit(
    client,
    input.userId,
    eventByType[input.invoiceType],
    {
      resource_type: "accounting.invoices",
      resource_id: invoiceId,
      operating_company_id: input.operatingCompanyId,
      invoice_type: input.invoiceType,
      display_id: displayId,
    },
    "info",
    "P6-FOUNDATION-INVOICE-TYPES"
  );
  return { id: invoiceId, display_id: displayId };
}
