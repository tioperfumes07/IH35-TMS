/**
 * UI-1 COMPLETE-BUILD — Receipts
 * GET  /api/v1/accounting/receipts        list (documents.attachments)
 * GET  /api/v1/accounting/receipts/:id    detail + presigned download URL
 *
 * QBO parity: Accounting > Receipts — uploaded receipts for expenses, bills, and
 * customer payment proof (check/ACH/wire confirmations on accounting.payments).
 * READ-ONLY list. Upload via existing /documents/attachments endpoint.
 * Entity-scoped. Money in cents.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { generatePresignedDownloadUrl } from "../storage/r2-client.js";

// ACCT-F5766 — the product's own normal expense/bill attachment upload flow writes category
// 'vendor_invoice' (confirmed live: 2 of 3 real expense attachments on Neon prod carry it, the other
// 1 carries 'receipt'), but this allowlist only ever matched 'receipt' for entity_type IN
// ('expense','bill') — so a real, correctly-uploaded vendor-invoice attachment never appeared in
// /accounting/receipts even though the generic attachments endpoint (documents/attachments.service.ts's
// listAttachments, which has no category filter) correctly returns it. Added 'vendor_invoice' to close
// the gap; every other CHECK-constraint-valid category (bol/pod/dvir/vendor_estimate/etc.) is a
// dispatch/safety/maintenance document, not an expense/bill receipt equivalent, so is intentionally
// NOT added without live evidence it is actually used here.
const RECEIPT_SCOPE_SQL = `(
  (a.entity_type IN ('expense','bill') AND a.category = ANY('{receipt,vendor_invoice}'::text[]))
  OR (a.entity_type = 'payment' AND a.category = ANY('{check_image,ach_confirmation,wire_confirmation,deposit_slip,receipt}'::text[]))
)`;

const listQuerySchema = companyQuerySchema.extend({
  entity_type: z.enum(["expense", "bill", "payment"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailParamsSchema = z.object({ id: z.string().uuid() });

/** Row shape returned by the receipts LIST query (documents.attachments + source joins). */
interface ReceiptListRow {
  id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  content_type: string;
  size_bytes: string;
  uploaded_at: string;
  notes: string | null;
  expense_number: string | null;
  expense_date: string | null;
  expense_amount_cents: string | null;
  expense_memo: string | null;
  expense_status: string | null;
  bill_number: string | null;
  bill_date: string | null;
  bill_amount_cents: string | null;
  bill_vendor_name: string | null;
  bill_status: string | null;
  payment_display_id: string | null;
  payment_date: string | null;
  payment_amount_cents: string | null;
  payment_reference: string | null;
  payment_voided_at: string | null;
  customer_name: string | null;
}

function mapReceiptSource(r: ReceiptListRow) {
  if (r.entity_type === "expense") {
    return {
      type: "expense" as const,
      expense_number: r.expense_number,
      date: r.expense_date,
      amount_cents: r.expense_amount_cents != null ? Number(r.expense_amount_cents) : null,
      memo: r.expense_memo,
      status: r.expense_status,
      detail_path: `/accounting/expenses/${r.entity_id}`,
    };
  }
  if (r.entity_type === "payment") {
    return {
      type: "payment" as const,
      payment_display_id: r.payment_display_id,
      customer_name: r.customer_name,
      date: r.payment_date,
      amount_cents: r.payment_amount_cents != null ? Number(r.payment_amount_cents) : null,
      reference: r.payment_reference,
      status: r.payment_voided_at ? "voided" : "active",
      detail_path: `/accounting/payments/${r.entity_id}`,
    };
  }
  return {
    type: "bill" as const,
    bill_number: r.bill_number,
    date: r.bill_date,
    amount_cents: r.bill_amount_cents != null ? Number(r.bill_amount_cents) : null,
    vendor_name: r.bill_vendor_name,
    status: r.bill_status,
    detail_path: `/accounting/bills/${r.entity_id}`,
  };
}

async function registerReceiptsRoutes(app: FastifyInstance) {
  // LIST
  app.get("/api/v1/accounting/receipts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, entity_type, date_from, date_to, q, limit, offset } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const conds = ["a.operating_company_id = $1::uuid", "a.is_deleted = false", RECEIPT_SCOPE_SQL];
      const params: unknown[] = [operating_company_id];
      let pi = 2;

      if (entity_type) {
        conds.push(`a.entity_type = $${pi++}`);
        params.push(entity_type);
      }
      if (date_from) {
        conds.push(`a.uploaded_at >= $${pi++}::date`);
        params.push(date_from);
      }
      if (date_to) {
        conds.push(`a.uploaded_at < ($${pi++}::date + interval '1 day')`);
        params.push(date_to);
      }
      if (q) {
        conds.push(
          `(a.filename ILIKE $${pi} OR COALESCE(a.notes,'') ILIKE $${pi} OR COALESCE(e.memo,'') ILIKE $${pi} OR COALESCE(bv.vendor_name,'') ILIKE $${pi} OR COALESCE(p.display_id,'') ILIKE $${pi} OR COALESCE(c.customer_name,'') ILIKE $${pi})`
        );
        params.push(`%${q}%`);
        pi++;
      }

      const where = conds.join(" AND ");
      const joins = `
        LEFT JOIN accounting.expenses e ON e.id = a.entity_id AND a.entity_type = 'expense'
        LEFT JOIN accounting.bills b ON b.id = a.entity_id AND a.entity_type = 'bill' AND b.operating_company_id = $1::uuid
        LEFT JOIN mdata.vendors bv
          ON bv.id::text = COALESCE(NULLIF(TRIM(b.vendor_id), ''), NULLIF(TRIM(b.vendor_uuid), ''))
         AND a.entity_type = 'bill'
         AND bv.operating_company_id = $1::uuid
        LEFT JOIN accounting.payments p ON p.id = a.entity_id AND a.entity_type = 'payment' AND p.operating_company_id = $1::uuid
        LEFT JOIN mdata.customers c ON c.id = p.customer_id AND a.entity_type = 'payment'
                                AND c.operating_company_id = $1::uuid
      `;

      const countRes = await client.query(
        `SELECT COUNT(*)::text AS total
         FROM documents.attachments a
         ${joins}
         WHERE ${where}`,
        params
      );
      const total = Number((countRes.rows[0] as { total: string }).total ?? 0);

      params.push(limit, offset);
      const listRes = await client.query(
        `SELECT
          a.id,
          a.entity_type,
          a.entity_id::text              AS entity_id,
          a.filename,
          a.content_type,
          a.size_bytes::text             AS size_bytes,
          a.uploaded_at::text            AS uploaded_at,
          a.notes,
          e.expense_number,
          e.transaction_date::text       AS expense_date,
          e.total_amount_cents::text     AS expense_amount_cents,
          e.memo                         AS expense_memo,
          e.status                       AS expense_status,
          b.bill_number,
          b.bill_date::text              AS bill_date,
          b.amount_cents::text           AS bill_amount_cents,
          bv.vendor_name                 AS bill_vendor_name,
          b.status                       AS bill_status,
          p.display_id                   AS payment_display_id,
          p.payment_date::text           AS payment_date,
          p.amount_cents::text           AS payment_amount_cents,
          p.reference                    AS payment_reference,
          p.voided_at::text              AS payment_voided_at,
          c.customer_name                         AS customer_name
        FROM documents.attachments a
        ${joins}
        WHERE ${where}
        ORDER BY a.uploaded_at DESC
        LIMIT $${pi++} OFFSET $${pi++}`,
        params
      );

      return {
        total,
        limit,
        offset,
        items: listRes.rows.map((r: ReceiptListRow) => ({
          id: r.id,
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          filename: r.filename,
          content_type: r.content_type,
          size_bytes: Number(r.size_bytes),
          uploaded_at: r.uploaded_at,
          notes: r.notes,
          source: mapReceiptSource(r),
        })),
      };
    });
  });

  // DETAIL + presigned download URL
  app.get("/api/v1/accounting/receipts/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const paramsParsed = detailParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return validationError(reply, paramsParsed.error);

    const queryParsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!queryParsed.success) return validationError(reply, queryParsed.error);

    return withCompanyScope(user.uuid, queryParsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT
          a.id,
          a.entity_type,
          a.entity_id::text AS entity_id,
          a.filename,
          a.content_type,
          a.size_bytes::text AS size_bytes,
          a.r2_object_key,
          a.r2_bucket,
          a.uploaded_at::text AS uploaded_at,
          a.notes,
          e.expense_number,
          e.transaction_date::text AS expense_date,
          e.total_amount_cents::text AS expense_amount_cents,
          e.memo AS expense_memo,
          e.status AS expense_status,
          b.bill_number,
          b.bill_date::text AS bill_date,
          b.amount_cents::text AS bill_amount_cents,
          bv.vendor_name AS bill_vendor_name,
          b.status AS bill_status,
          p.display_id AS payment_display_id,
          p.payment_date::text AS payment_date,
          p.amount_cents::text AS payment_amount_cents,
          p.reference AS payment_reference,
          p.voided_at::text AS payment_voided_at,
          c.customer_name AS customer_name
         FROM documents.attachments a
         LEFT JOIN accounting.expenses e ON e.id = a.entity_id AND a.entity_type = 'expense'
         LEFT JOIN accounting.bills b ON b.id = a.entity_id AND a.entity_type = 'bill' AND b.operating_company_id = $2::uuid
         LEFT JOIN mdata.vendors bv
           ON bv.id::text = COALESCE(NULLIF(TRIM(b.vendor_id), ''), NULLIF(TRIM(b.vendor_uuid), ''))
          AND a.entity_type = 'bill'
          AND bv.operating_company_id = $2::uuid
         LEFT JOIN accounting.payments p ON p.id = a.entity_id AND a.entity_type = 'payment' AND p.operating_company_id = $2::uuid
         LEFT JOIN mdata.customers c ON c.id = p.customer_id AND a.entity_type = 'payment'
                                AND c.operating_company_id = $2::uuid
         WHERE a.id = $1 AND a.operating_company_id = $2::uuid
           AND a.is_deleted = false
           AND ${RECEIPT_SCOPE_SQL}`,
        [paramsParsed.data.id, queryParsed.data.operating_company_id]
      );

      if (!res.rows[0]) return reply.code(404).send({ error: "not_found" });

      const row = res.rows[0] as ReceiptListRow & {
        r2_object_key: string;
        r2_bucket: string;
      };

      const download_url = await generatePresignedDownloadUrl(row.r2_object_key);

      return {
        id: row.id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        filename: row.filename,
        content_type: row.content_type,
        size_bytes: Number(row.size_bytes),
        r2_object_key: row.r2_object_key,
        r2_bucket: row.r2_bucket,
        uploaded_at: row.uploaded_at,
        notes: row.notes,
        download_url,
        source: mapReceiptSource(row),
      };
    });
  });
}

export default fp(registerReceiptsRoutes);
