/**
 * Entity-specific loaders + payload assembly for outbound QBO accounting sync.
 * Pure translators live under ./translators — this module performs DB reads (same txn as dispatcher).
 */
import type { PoolClient } from "pg";
import { buildQboBillPayload } from "./translators/bill.js";
import { buildQboBillPaymentPayload, type BillPaymentPayKind } from "./translators/bill_payment.js";
import { buildQboCreditMemoPayload } from "./translators/credit_memo.js";
import { buildQboExpensePurchasePayload } from "./translators/expense.js";
import { buildQboFactoringAdvanceJournalPayload } from "./translators/factoring_advance.js";
import { buildQboInvoicePayload } from "./translators/invoice.js";
import { buildQboJournalEntryPayload } from "./translators/journal_entry.js";
import { buildQboPaymentPayload } from "./translators/payment.js";
import type { AccountingOutboundEntityType } from "./sync-outbound-accounting.types.js";

export type AccountingBuildResult = {
  entityPath: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  readIds: (json: Record<string, unknown>) => { qboId: string | null; syncToken: string | null };
  applySuccess: (args: {
    client: PoolClient;
    oc: string;
    entityId: string;
    qboId: string;
    syncToken: string | null;
  }) => Promise<void>;
};

async function pickDefaultItemQboId(client: PoolClient, oc: string): Promise<string | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
  const res = await client.query<{ qbo_id: string }>(
    `
      SELECT qbo_id
      FROM mdata.qbo_items
      WHERE operating_company_id = $1::uuid
        AND active = true
        AND COALESCE(qbo_id, '') <> ''
      ORDER BY mirrored_at DESC NULLS LAST
      LIMIT 1
    `,
    [oc]
  );
  return res.rows[0]?.qbo_id ?? null;
}

export async function resolveCustomerQboId(client: PoolClient, oc: string, customerUuid: string): Promise<string | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
  const res = await client.query<{ qbo_id: string | null }>(
    `
      SELECT qc.qbo_id
      FROM mdata.customers c
      LEFT JOIN mdata.qbo_customers qc
        ON qc.customer_uuid = c.id
       AND qc.operating_company_id = c.operating_company_id
       AND qc.active = true
      WHERE c.id = $2::uuid
        AND c.operating_company_id = $1::uuid
      LIMIT 1
    `,
    [oc, customerUuid]
  );
  const direct = res.rows[0]?.qbo_id ?? null;
  if (direct) return direct;
  const snap = await client.query<{ qbo_entity_id: string | null }>(
    `
      SELECT qbo_entity_id
      FROM qbo_archive.entities_snapshot
      WHERE operating_company_id = $1::uuid
        AND qbo_entity_type = 'Customer'
        AND raw_snapshot->>'Id' IS NOT NULL
      ORDER BY snapshot_taken_at DESC
      LIMIT 1
    `,
    [oc]
  );
  return snap.rows[0]?.qbo_entity_id ?? null;
}

async function resolveVendorQboId(client: PoolClient, oc: string, vendorUuid: string): Promise<string | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
  const res = await client.query<{ qbo_id: string | null }>(
    `
      SELECT qv.qbo_id
      FROM mdata.vendors v
      LEFT JOIN mdata.qbo_vendors qv
        ON qv.vendor_uuid = v.id
       AND qv.operating_company_id = v.operating_company_id
       AND qv.active = true
      WHERE v.id = $2::uuid
        AND v.operating_company_id = $1::uuid
      LIMIT 1
    `,
    [oc, vendorUuid]
  );
  return res.rows[0]?.qbo_id ?? null;
}

async function resolveAccountQboId(client: PoolClient, oc: string, accountUuid: string | null): Promise<string | null> {
  if (!accountUuid) return null;
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
  const res = await client.query<{ qbo_account_id: string | null }>(
    `
      SELECT qbo_account_id
      FROM catalogs.accounts
      WHERE id = $2::uuid
        AND operating_company_id = $1::uuid
      LIMIT 1
    `,
    [oc, accountUuid]
  );
  return res.rows[0]?.qbo_account_id ?? null;
}

export async function loadEntityVersionSnapshot(
  client: PoolClient,
  oc: string,
  entityType: AccountingOutboundEntityType,
  entityId: string
): Promise<{ version_int: number; updated_at: string }> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
  switch (entityType) {
    case "invoice": {
      const r = await client.query<{ version_int: number | null; updated_at: string | null }>(
        `SELECT version_int::int, updated_at::text FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: row?.version_int ?? 1, updated_at: row?.updated_at ?? new Date().toISOString() };
    }
    case "bill": {
      const r = await client.query<{ version_int: number | null; updated_at: string | null }>(
        `SELECT version_int::int, updated_at::text FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: row?.version_int ?? 1, updated_at: row?.updated_at ?? new Date().toISOString() };
    }
    case "journal_entry": {
      const r = await client.query<{ version_int: number | null; updated_at: string | null }>(
        `SELECT version_int::int, updated_at::text FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: row?.version_int ?? 1, updated_at: row?.updated_at ?? new Date().toISOString() };
    }
    case "bill_payment": {
      const r = await client.query<{ version_int: number | null; updated_at: string | null }>(
        `SELECT version_int::int, updated_at::text FROM accounting.bill_payments WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: row?.version_int ?? 1, updated_at: row?.updated_at ?? new Date().toISOString() };
    }
    case "payment": {
      const r = await client.query<{ version_int: number | null; created_at: string | null }>(
        `SELECT version_int::int, created_at::text FROM accounting.payments WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: row?.version_int ?? 1, updated_at: row?.created_at ?? new Date().toISOString() };
    }
    case "credit_memo": {
      const r = await client.query<{ version_int: number | null; created_at: string | null }>(
        `SELECT version_int::int, created_at::text FROM accounting.credit_memos WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: row?.version_int ?? 1, updated_at: row?.created_at ?? new Date().toISOString() };
    }
    case "factoring_advance": {
      const r = await client.query<{ version_int: number | null; created_at: string | null }>(
        `SELECT version_int::int, created_at::text FROM accounting.factoring_advances WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: row?.version_int ?? 1, updated_at: row?.created_at ?? new Date().toISOString() };
    }
    case "expense": {
      const r = await client.query<{ created_at: string | null }>(
        `SELECT created_at::text FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [entityId, oc]
      );
      const row = r.rows[0];
      return { version_int: 1, updated_at: row?.created_at ?? new Date().toISOString() };
    }
    default:
      return { version_int: 1, updated_at: new Date().toISOString() };
  }
}

export async function buildAccountingOutboundPayload(
  client: PoolClient,
  oc: string,
  entityType: AccountingOutboundEntityType,
  entityId: string,
  queuePayloadJsonb: unknown | null
): Promise<AccountingBuildResult> {
  switch (entityType) {
    case "invoice": {
      const invRes = await client.query<{
        display_id: string;
        issue_date: string;
        due_date: string;
        internal_notes: string | null;
        customer_notes: string | null;
        total_cents: number;
        customer_id: string;
        qbo_invoice_id: string | null;
        qbo_sync_token: string | null;
        ar_email_snapshot: string | null;
      }>(
        `
          SELECT display_id, issue_date::text, due_date::text,
                 internal_notes, customer_notes, total_cents::int,
                 customer_id::text, qbo_invoice_id, qbo_sync_token,
                 ar_email_snapshot
          FROM accounting.invoices
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE
        `,
        [entityId, oc]
      );
      const inv = invRes.rows[0];
      if (!inv) throw new Error("invoice_not_found");

      const custQbo = await resolveCustomerQboId(client, oc, inv.customer_id);
      if (!custQbo) throw new Error("customer_qbo_id_unresolved");

      const linesRes = await client.query<{
        line_total_cents: number;
        quantity: string;
        unit_amount_cents: number;
        description: string;
        qbo_item_id: string | null;
        qbo_class_snapshot: string | null;
      }>(
        `
          SELECT line_total_cents::int, quantity::text, unit_amount_cents::int,
                 description, qbo_item_id, qbo_class_snapshot
          FROM accounting.invoice_lines
          WHERE invoice_id = $1::uuid AND operating_company_id = $2::uuid
          ORDER BY display_order ASC, created_at ASC
        `,
        [entityId, oc]
      );

      const defaultItem = await pickDefaultItemQboId(client, oc);
      const lines = linesRes.rows.map((ln) => {
        const qty = Number(ln.quantity || 1);
        return {
          amountCents: ln.line_total_cents,
          quantity: qty,
          unitPriceCents: ln.unit_amount_cents,
          itemQboId: ln.qbo_item_id ?? defaultItem ?? "",
          description: ln.description,
          classQboId: ln.qbo_class_snapshot ?? undefined,
        };
      });
      if (lines.some((l) => !l.itemQboId)) throw new Error("invoice_line_missing_item_qbo_id");

      const body = buildQboInvoicePayload({
        header: {
          display_id: inv.display_id,
          issue_date: inv.issue_date,
          due_date: inv.due_date,
          internal_notes: inv.internal_notes,
          customer_facing_memo: inv.customer_notes,
          total_cents: inv.total_cents,
          qbo_invoice_id: inv.qbo_invoice_id,
          qbo_sync_token: inv.qbo_sync_token,
        },
        customerQboId: custQbo,
        billEmail: inv.ar_email_snapshot,
        lines,
      });
      const isPatch = Boolean(inv.qbo_invoice_id && inv.qbo_sync_token);
      return {
        entityPath: "invoice",
        method: isPatch ? "PATCH" : "POST",
        body,
        readIds: (json) => {
          const row = json.Invoice as Record<string, unknown> | undefined;
          return {
            qboId: row?.Id != null ? String(row.Id) : null,
            syncToken: row?.SyncToken != null ? String(row.SyncToken) : null,
          };
        },
        applySuccess: async ({ client: c, oc: occ, entityId: eid, qboId, syncToken }) => {
          await c.query(
            `
              UPDATE accounting.invoices
              SET qbo_invoice_id = $3,
                  qbo_sync_token = COALESCE($4, qbo_sync_token),
                  last_qbo_synced_at = now(),
                  version_int = version_int + 1,
                  qbo_sync_pending = false,
                  updated_at = now()
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
            `,
            [eid, occ, qboId, syncToken]
          );
        },
      };
    }

    case "bill": {
      const billRes = await client.query<{
        vendor_uuid: string | null;
        bill_date: string;
        bill_number: string | null;
        amount_cents: number | null;
        memo: string | null;
        qbo_bill_id: string | null;
        qbo_sync_token: string | null;
        coa_account_id: string | null;
      }>(
        `
          SELECT trim(vendor_uuid)::text AS vendor_uuid, bill_date::text, bill_number,
                 amount_cents::int, memo, qbo_bill_id, qbo_sync_token,
                 coa_account_id::text
          FROM accounting.bills
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE
        `,
        [entityId, oc]
      );
      const bill = billRes.rows[0];
      if (!bill?.vendor_uuid) throw new Error("bill_not_found");

      const vendorQbo = await resolveVendorQboId(client, oc, bill.vendor_uuid);
      if (!vendorQbo) throw new Error("vendor_qbo_id_unresolved");

      const apAccount =
        (await resolveAccountQboId(client, oc, bill.coa_account_id)) ??
        (
          await client.query<{ qbo_entity_id: string | null }>(
            `
              SELECT qbo_entity_id
              FROM qbo_archive.entities_snapshot
              WHERE operating_company_id = $1::uuid
                AND qbo_entity_type = 'Account'
                AND COALESCE(raw_snapshot->>'AccountType','') IN ('Accounts Payable','Credit Card')
              ORDER BY snapshot_taken_at DESC NULLS LAST
              LIMIT 1
            `,
            [oc]
          )
        ).rows[0]?.qbo_entity_id;
      if (!apAccount) throw new Error("ap_account_qbo_unresolved");

      const lineRows = await client.query<{ amount: string; description: string | null }>(
        `
          SELECT amount::text, description
          FROM accounting.bill_lines
          WHERE bill_id = $1::uuid
          ORDER BY line_sequence ASC
        `,
        [entityId]
      );

      const expenseAcct =
        (await resolveAccountQboId(client, oc, bill.coa_account_id)) ?? apAccount;

      const resolvedLines =
        lineRows.rows.length > 0
          ? lineRows.rows.map((r) => ({
              amountCents: Math.round(Number(r.amount) * 100),
              description: r.description,
              accountQboId: expenseAcct,
            }))
          : [
              {
                amountCents: bill.amount_cents ?? 0,
                description: bill.memo,
                accountQboId: expenseAcct,
              },
            ];

      const body = buildQboBillPayload({
        vendorQboId: vendorQbo,
        apAccountQboId: apAccount,
        txnDate: bill.bill_date,
        docNumber: bill.bill_number,
        privateNote: bill.memo,
        totalCents: resolvedLines.reduce((s, l) => s + l.amountCents, 0),
        qbo_bill_id: bill.qbo_bill_id,
        qbo_sync_token: bill.qbo_sync_token,
        lines: resolvedLines,
      });
      const isPatch = Boolean(bill.qbo_bill_id && bill.qbo_sync_token);
      return {
        entityPath: "bill",
        method: isPatch ? "PATCH" : "POST",
        body,
        readIds: (json) => {
          const row = json.Bill as Record<string, unknown> | undefined;
          return {
            qboId: row?.Id != null ? String(row.Id) : null,
            syncToken: row?.SyncToken != null ? String(row.SyncToken) : null,
          };
        },
        applySuccess: async ({ client: c, oc: occ, entityId: eid, qboId, syncToken }) => {
          await c.query(
            `
              UPDATE accounting.bills
              SET qbo_bill_id = $3,
                  qbo_sync_token = COALESCE($4, qbo_sync_token),
                  last_qbo_synced_at = now(),
                  version_int = COALESCE(version_int, 1) + 1,
                  updated_at = now()
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
            `,
            [eid, occ, qboId, syncToken]
          );
        },
      };
    }

    case "journal_entry": {
      const header = await client.query<{
        entry_date: string;
        memo: string | null;
        status: string;
        qbo_journal_entry_id: string | null;
        qbo_sync_token: string | null;
      }>(
        `
          SELECT entry_date::text, memo, status::text,
                 qbo_journal_entry_id, qbo_sync_token
          FROM accounting.journal_entries
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE
        `,
        [entityId, oc]
      );
      const h = header.rows[0];
      if (!h) throw new Error("journal_entry_not_found");

      const postings = await client.query<{
        debit_or_credit: string;
        amount_cents: number;
        description: string | null;
        qbo_account_id: string | null;
        qbo_class_id: string | null;
        driver_qbo_vendor_id: string | null;
      }>(
        `
          SELECT p.debit_or_credit, p.amount_cents::int, p.description,
                 a.qbo_account_id, c.qbo_class_id,
                 d.qbo_vendor_id AS driver_qbo_vendor_id
          FROM accounting.journal_entry_postings p
          LEFT JOIN catalogs.accounts a ON a.id = p.account_id
          LEFT JOIN catalogs.classes c ON c.id = p.class_id
          LEFT JOIN mdata.drivers d ON d.id = p.entity_uuid
          WHERE p.journal_entry_uuid = $1::uuid
            AND p.operating_company_id = $2::uuid
          ORDER BY p.line_sequence ASC
        `,
        [entityId, oc]
      );

      const lines = postings.rows.map((p) => ({
        postingType: (p.debit_or_credit === "credit" ? "Credit" : "Debit") as "Debit" | "Credit",
        amountCents: p.amount_cents,
        accountQboId: p.qbo_account_id ?? "",
        classQboId: p.qbo_class_id ?? undefined,
        entity:
          p.driver_qbo_vendor_id != null
            ? { Type: "Vendor", EntityRef: { value: p.driver_qbo_vendor_id } }
            : undefined,
        description: p.description,
      }));
      if (lines.some((l) => !l.accountQboId)) throw new Error("journal_line_missing_account_qbo_id");

      const body = buildQboJournalEntryPayload({
        txnDate: h.entry_date,
        docNumber: null,
        adjustment: false,
        memo: h.memo,
        qbo_journal_entry_id: h.qbo_journal_entry_id,
        qbo_sync_token: h.qbo_sync_token,
        lines,
      });
      const isPatch = Boolean(h.qbo_journal_entry_id && h.qbo_sync_token);
      return {
        entityPath: "journalentry",
        method: isPatch ? "PATCH" : "POST",
        body,
        readIds: (json) => {
          const row = json.JournalEntry as Record<string, unknown> | undefined;
          return {
            qboId: row?.Id != null ? String(row.Id) : null,
            syncToken: row?.SyncToken != null ? String(row.SyncToken) : null,
          };
        },
        applySuccess: async ({ client: c, oc: occ, entityId: eid, qboId, syncToken }) => {
          await c.query(
            `
              UPDATE accounting.journal_entries
              SET qbo_journal_entry_id = $3,
                  qbo_sync_token = COALESCE($4, qbo_sync_token),
                  last_qbo_synced_at = now(),
                  version_int = version_int + 1,
                  qbo_sync_pending = false,
                  updated_at = now()
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
            `,
            [eid, occ, qboId, syncToken]
          );
        },
      };
    }

    case "bill_payment": {
      const loaded = await client.query<{
        payment_date: string;
        amount_cents: number;
        memo: string | null;
        bill_id: string;
        qbo_bill_id: string | null;
        vendor_uuid: string | null;
        payment_method: string | null;
        from_bank_account_id: string | null;
        qbo_bill_payment_id: string | null;
        qbo_sync_token: string | null;
      }>(
        `
          SELECT bp.payment_date::text, bp.amount_cents::int, bp.memo,
                 b.id::text AS bill_id, b.qbo_bill_id,
                 trim(b.vendor_uuid)::text AS vendor_uuid,
                 bp.payment_method::text, bp.from_bank_account_id::text,
                 bp.qbo_bill_payment_id, bp.qbo_sync_token
          FROM accounting.bill_payments bp
          JOIN accounting.bills b ON b.id = bp.bill_id
          WHERE bp.id = $1::uuid AND bp.operating_company_id = $2::uuid
          FOR UPDATE OF bp
        `,
        [entityId, oc]
      );
      const row = loaded.rows[0];
      if (!row || !row.qbo_bill_id || !row.vendor_uuid) throw new Error("bill_payment_unresolved_prereq");

      const vendorQbo = await resolveVendorQboId(client, oc, row.vendor_uuid);
      if (!vendorQbo) throw new Error("vendor_qbo_id_unresolved");

      const bankQbo =
        row.from_bank_account_id != null
          ? await resolveAccountQboId(client, oc, row.from_bank_account_id)
          : null;

      const payType: BillPaymentPayKind =
        row.payment_method === "credit_card" ? "CreditCard" : row.payment_method === "cash" ? "Cash" : "Check";

      const body = buildQboBillPaymentPayload({
        vendorQboId: vendorQbo,
        txnDate: row.payment_date,
        memo: row.memo,
        totalCents: row.amount_cents,
        payType,
        bankAccountQboId: payType === "Check" || payType === "Cash" ? bankQbo : null,
        ccAccountQboId: payType === "CreditCard" ? bankQbo : null,
        qbo_bill_payment_id: row.qbo_bill_payment_id,
        qbo_sync_token: row.qbo_sync_token,
        allocations: [{ billQboId: row.qbo_bill_id, amountCents: row.amount_cents }],
      });

      const isPatch = Boolean(row.qbo_bill_payment_id && row.qbo_sync_token);
      return {
        entityPath: "billpayment",
        method: isPatch ? "PATCH" : "POST",
        body,
        readIds: (json) => {
          const bp = json.BillPayment as Record<string, unknown> | undefined;
          return {
            qboId: bp?.Id != null ? String(bp.Id) : null,
            syncToken: bp?.SyncToken != null ? String(bp.SyncToken) : null,
          };
        },
        applySuccess: async ({ client: c, oc: occ, entityId: eid, qboId, syncToken }) => {
          await c.query(
            `
              UPDATE accounting.bill_payments
              SET qbo_bill_payment_id = $3,
                  qbo_sync_token = COALESCE($4, qbo_sync_token),
                  last_qbo_synced_at = now(),
                  version_int = COALESCE(version_int, 1) + 1,
                  updated_at = now()
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
            `,
            [eid, occ, qboId, syncToken]
          );
          const mappingExists = await c.query(`SELECT to_regclass('qbo.bill_payment_mappings') IS NOT NULL AS ok`);
          if (mappingExists.rows[0]?.ok && row.qbo_bill_id) {
            await c.query(
              `
                INSERT INTO qbo.bill_payment_mappings (
                  operating_company_id,
                  payment_id,
                  qbo_bill_payment_id,
                  bill_id,
                  qbo_bill_id,
                  amount_cents
                )
                SELECT $1, $2::uuid, $3, $4::uuid, $5, $6::int
                WHERE NOT EXISTS (
                  SELECT 1 FROM qbo.bill_payment_mappings m
                  WHERE m.payment_id = $2::uuid AND m.qbo_bill_payment_id = $3
                )
              `,
              [occ, eid, qboId, row.bill_id, row.qbo_bill_id, row.amount_cents]
            );
          }
        },
      };
    }

    case "payment": {
      const pay = await client.query<{
        customer_id: string;
        payment_date: string;
        amount_cents: number;
        notes: string | null;
        deposited_to_account_id: string | null;
        qbo_payment_id: string | null;
        qbo_sync_token: string | null;
      }>(
        `
          SELECT customer_id::text, payment_date::text, amount_cents::int,
                 notes, deposited_to_account_id::text,
                 qbo_payment_id, qbo_sync_token
          FROM accounting.payments
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
          FOR UPDATE
        `,
        [entityId, oc]
      );
      const p = pay.rows[0];
      if (!p) throw new Error("payment_not_found");

      const custQbo = await resolveCustomerQboId(client, oc, p.customer_id);
      if (!custQbo) throw new Error("customer_qbo_id_unresolved");

      const apps = await client.query<{ amount_cents: number; qbo_invoice_id: string | null }>(
        `
          SELECT pa.amount_cents::int, inv.qbo_invoice_id
          FROM accounting.payment_applications pa
          JOIN accounting.invoices inv ON inv.id = pa.invoice_id
          WHERE pa.payment_id = $1::uuid AND pa.operating_company_id = $2::uuid
        `,
        [entityId, oc]
      );
      const allocations = apps.rows
        .filter((r) => r.qbo_invoice_id)
        .map((r) => ({ invoiceQboId: r.qbo_invoice_id as string, amountCents: r.amount_cents }));
      if (allocations.length === 0) throw new Error("payment_missing_allocated_invoice_qbo_ids");

      const depositAcct =
        p.deposited_to_account_id != null
          ? await resolveAccountQboId(client, oc, p.deposited_to_account_id)
          : null;

      const body = buildQboPaymentPayload({
        customerQboId: custQbo,
        totalCents: p.amount_cents,
        paymentDate: p.payment_date,
        depositToAccountQboId: depositAcct,
        paymentMethodQboId: undefined,
        privateNote: p.notes,
        qbo_payment_id: p.qbo_payment_id,
        qbo_sync_token: p.qbo_sync_token,
        allocations,
      });

      const isPatch = Boolean(p.qbo_payment_id && p.qbo_sync_token);
      return {
        entityPath: "payment",
        method: isPatch ? "PATCH" : "POST",
        body,
        readIds: (json) => {
          const row = json.Payment as Record<string, unknown> | undefined;
          return {
            qboId: row?.Id != null ? String(row.Id) : null,
            syncToken: row?.SyncToken != null ? String(row.SyncToken) : null,
          };
        },
        applySuccess: async ({ client: c, oc: occ, entityId: eid, qboId, syncToken }) => {
          await c.query(
            `
              UPDATE accounting.payments
              SET qbo_payment_id = $3,
                  qbo_sync_token = COALESCE($4, qbo_sync_token),
                  last_qbo_synced_at = now(),
                  version_int = COALESCE(version_int, 1) + 1,
                  qbo_sync_pending = false
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
            `,
            [eid, occ, qboId, syncToken]
          );
        },
      };
    }

    case "credit_memo": {
      const cm = await client.query<{
        customer_id: string;
        issue_date: string;
        display_id: string;
        amount_cents: number;
        notes: string | null;
        amount_applied_cents: number;
        qbo_credit_memo_id: string | null;
        qbo_sync_token: string | null;
      }>(
        `
          SELECT customer_id::text, issue_date::text, display_id, amount_cents::int,
                 notes, amount_applied_cents::int,
                 qbo_credit_memo_id, qbo_sync_token
          FROM accounting.credit_memos
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE
        `,
        [entityId, oc]
      );
      const c = cm.rows[0];
      if (!c) throw new Error("credit_memo_not_found");

      const custQbo = await resolveCustomerQboId(client, oc, c.customer_id);
      if (!custQbo) throw new Error("customer_qbo_id_unresolved");

      const defaultItem = await pickDefaultItemQboId(client, oc);
      if (!defaultItem) throw new Error("default_qbo_item_missing");

      const body = buildQboCreditMemoPayload({
        customerQboId: custQbo,
        txnDate: c.issue_date,
        docNumber: c.display_id,
        totalCents: c.amount_cents,
        privateNote: c.notes,
        defaultItemQboId: defaultItem,
        description: c.notes,
        remainingCreditCents: c.amount_cents - c.amount_applied_cents,
        qbo_credit_memo_id: c.qbo_credit_memo_id,
        qbo_sync_token: c.qbo_sync_token,
      });

      const isPatch = Boolean(c.qbo_credit_memo_id && c.qbo_sync_token);
      return {
        entityPath: "creditmemo",
        method: isPatch ? "PATCH" : "POST",
        body,
        readIds: (json) => {
          const row = json.CreditMemo as Record<string, unknown> | undefined;
          return {
            qboId: row?.Id != null ? String(row.Id) : null,
            syncToken: row?.SyncToken != null ? String(row.SyncToken) : null,
          };
        },
        applySuccess: async ({ client: cx, oc: occ, entityId: eid, qboId, syncToken }) => {
          await cx.query(
            `
              UPDATE accounting.credit_memos
              SET qbo_credit_memo_id = $3,
                  qbo_sync_token = COALESCE($4, qbo_sync_token),
                  last_qbo_synced_at = now(),
                  version_int = COALESCE(version_int, 1) + 1,
                  qbo_sync_pending = false
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
            `,
            [eid, occ, qboId, syncToken]
          );
        },
      };
    }

    case "factoring_advance": {
      const adv = await client.query<{
        display_id: string;
        advanced_at: string | null;
        submitted_at: string;
        advance_amount_cents: number;
        memo: string | null;
        notes: string | null;
        qbo_advance_id: string | null;
        qbo_sync_token: string | null;
      }>(
        `
          SELECT display_id, advanced_at::text, submitted_at::text,
                 advance_amount_cents::int, memo, notes,
                 qbo_advance_id, qbo_sync_token
          FROM accounting.factoring_advances
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE
        `,
        [entityId, oc]
      );
      const a = adv.rows[0];
      if (!a) throw new Error("factoring_advance_not_found");

      const payloadExtra =
        queuePayloadJsonb && typeof queuePayloadJsonb === "object"
          ? (queuePayloadJsonb as Record<string, unknown>)
          : {};
      const cashId =
        typeof payloadExtra.cash_account_qbo_id === "string" ? payloadExtra.cash_account_qbo_id : null;
      const liabilityId =
        typeof payloadExtra.liability_account_qbo_id === "string" ? payloadExtra.liability_account_qbo_id : null;
      if (!cashId || !liabilityId) throw new Error("factoring_advance_missing_account_mapping_payload");

      const txnDate = (a.advanced_at ?? a.submitted_at).slice(0, 10);
      const memoText =
        `Factoring advance INV-${a.display_id}` + (a.memo ? ` — ${a.memo}` : "") + (a.notes ? ` — ${a.notes}` : "");

      const body = buildQboFactoringAdvanceJournalPayload({
        txnDate,
        docNumber: `FA-${a.display_id}`,
        amountCents: a.advance_amount_cents,
        memo: memoText,
        cashAccountQboId: cashId,
        liabilityAccountQboId: liabilityId,
        qbo_journal_entry_id: a.qbo_advance_id,
        qbo_sync_token: a.qbo_sync_token,
      });

      const isPatch = Boolean(a.qbo_advance_id && a.qbo_sync_token);
      return {
        entityPath: "journalentry",
        method: isPatch ? "PATCH" : "POST",
        body,
        readIds: (json) => {
          const row = json.JournalEntry as Record<string, unknown> | undefined;
          return {
            qboId: row?.Id != null ? String(row.Id) : null,
            syncToken: row?.SyncToken != null ? String(row.SyncToken) : null,
          };
        },
        applySuccess: async ({ client: cx, oc: occ, entityId: eid, qboId, syncToken }) => {
          await cx.query(
            `
              UPDATE accounting.factoring_advances
              SET qbo_advance_id = $3,
                  qbo_sync_token = COALESCE($4, qbo_sync_token),
                  last_qbo_synced_at = now(),
                  version_int = COALESCE(version_int, 1) + 1
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
            `,
            [eid, occ, qboId, syncToken]
          );
        },
      };
    }

    case "expense": {
      const ex = await client.query<{
        transaction_date: string;
        total_amount: string;
        memo: string | null;
        vendor_uuid: string | null;
        payment_account_uuid: string | null;
      }>(
        `
          SELECT transaction_date::text, total_amount::text, memo,
                 vendor_uuid::text, payment_account_uuid::text
          FROM accounting.expenses
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE
        `,
        [entityId, oc]
      );
      const e = ex.rows[0];
      if (!e) throw new Error("expense_not_found");

      const vendorQbo =
        e.vendor_uuid != null ? await resolveVendorQboId(client, oc, e.vendor_uuid) : null;

      const expAcct =
        e.payment_account_uuid != null
          ? await resolveAccountQboId(client, oc, e.payment_account_uuid)
          : null;
      const expenseAccount =
        expAcct ??
        (
          await client.query<{ qbo_entity_id: string | null }>(
            `
              SELECT qbo_entity_id
              FROM qbo_archive.entities_snapshot
              WHERE operating_company_id = $1::uuid
                AND qbo_entity_type = 'Account'
                AND COALESCE(raw_snapshot->>'AccountType','') IN ('Expense','Cost of Goods Sold')
              ORDER BY snapshot_taken_at DESC NULLS LAST
              LIMIT 1
            `,
            [oc]
          )
        ).rows[0]?.qbo_entity_id;
      if (!expenseAccount) throw new Error("expense_account_qbo_unresolved");

      const total = Number(e.total_amount);
      const body = buildQboExpensePurchasePayload({
        txnDate: e.transaction_date,
        totalAmount: total,
        memo: e.memo,
        vendorQboId: vendorQbo,
        expenseAccountQboId: expenseAccount,
      });
      return {
        entityPath: "purchase",
        method: "POST",
        body,
        readIds: (json) => {
          const row = json.Purchase as Record<string, unknown> | undefined;
          return {
            qboId: row?.Id != null ? String(row.Id) : null,
            syncToken: row?.SyncToken != null ? String(row.SyncToken) : null,
          };
        },
        applySuccess: async () => {
          /* expenses table has no qbo mirror column */
        },
      };
    }

    default:
      throw new Error(`unsupported_accounting_entity_${String(entityType)}`);
  }
}
