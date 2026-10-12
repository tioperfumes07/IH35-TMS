import { randomUUID } from "node:crypto";
import type pg from "pg";
import { TEST_OWNER_USER_ID } from "./constants.js";
import { prepareCompanyForLoadInserts } from "./db-fixture.js";

/**
 * LAW 363.2 / ROUND 363-CC3-A — accounting.invoices.invoice_type defaults to 'from_load', and the database refuses a
 * from_load invoice with no source_load_id (trg_from_load_invoice_carries_its_load, migration 202615330931). A test
 * fixture that writes a from_load invoice therefore writes its load FIRST and stamps source_load_id on the invoice.
 *
 * Inserts one minimal valid mdata.loads row (the same shape as invoice-ar-killswitch / subledger-gl-tieout-ar) for
 * `customerId` under `companyId` and returns its id. The caller must already be inside a transaction with
 * app.bypass_rls = 'lucia'; the company GUC is set here (transaction-local) because the catalog seeds the load needs
 * (dispatch flag colours, DRY_VAN trailer equipment) carry a company-GUC-only policy.
 */
export async function insertLoadForInvoice(
  client: pg.Client,
  companyId: string,
  customerId: string,
  opts: { loadId?: string; loadNumber?: string; rateTotalCents?: number } = {}
): Promise<string> {
  const loadId = opts.loadId ?? randomUUID();
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
  const trailerEquipmentId = await prepareCompanyForLoadInserts(client, companyId);
  await client.query(
    `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'delivered', $5, $6::uuid, $7::uuid)`,
    [
      loadId,
      companyId,
      opts.loadNumber ?? `L-${randomUUID().slice(0, 8)}`,
      customerId,
      opts.rateTotalCents ?? 0,
      TEST_OWNER_USER_ID,
      trailerEquipmentId,
    ]
  );
  return loadId;
}

/**
 * The two refusals that stand right behind the load-born one on the same invoice INSERT:
 *   - invoice_must_have_lines (202614780000, deferred to COMMIT): a live invoice header has at least one line;
 *   - trg_invoice_sent_requires_live_line (202615170300, BEFORE INSERT/UPDATE OF status): an invoice with money on it
 *     cannot be sent / partial / paid / overdue without a live line — the send path writes the line first.
 * So a fixture writes the header (as 'draft' when its target status is one of those four), then this line, then — via
 * `status` — moves the header to its target status, exactly as the send path does. The line is the load's linehaul
 * and carries the same load as its header.
 */
export async function insertInvoiceLine(
  client: pg.Client,
  companyId: string,
  invoiceId: string,
  amountCents: number,
  opts: { loadId?: string | null; status?: "sent" | "partial" | "paid" | "overdue" } = {}
): Promise<void> {
  await client.query(
    `INSERT INTO accounting.invoice_lines
       (operating_company_id, invoice_id, source_load_id, line_type, description, quantity, unit_amount_cents, line_total_cents, display_order)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'linehaul', 'Linehaul', 1, $4, $4, 0)`,
    [companyId, invoiceId, opts.loadId ?? null, amountCents]
  );
  if (opts.status) {
    await client.query(`UPDATE accounting.invoices SET status = $2 WHERE id = $1::uuid`, [invoiceId, opts.status]);
  }
}
