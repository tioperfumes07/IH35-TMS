/**
 * UI-1 COMPLETE-BUILD — Receipts
 * GET  /api/v1/accounting/receipts        list (documents.attachments category='receipt')
 * GET  /api/v1/accounting/receipts/:id    detail + presigned download URL
 *
 * QBO parity: Accounting > Receipts — scanned/uploaded receipts linked to expenses or bills.
 * READ-ONLY list. Upload via existing /documents/attachments endpoint.
 * Entity-scoped. Money in cents.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { generatePresignedDownloadUrl } from "../storage/r2-client.js";

const listQuerySchema = companyQuerySchema.extend({
  entity_type: z.enum(["expense", "bill"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailParamsSchema = z.object({ id: z.string().uuid() });

async function registerReceiptsRoutes(app: FastifyInstance) {
  // LIST
  app.get("/api/v1/accounting/receipts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, entity_type, date_from, date_to, q, limit, offset } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const conds = [
        "a.operating_company_id = $1",
        "a.category = 'receipt'",
        "a.is_deleted = false",
        "a.entity_type IN ('expense','bill')",
      ];
      const params: unknown[] = [operating_company_id];
      let pi = 2;

      if (entity_type) { conds.push(`a.entity_type = $${pi++}`); params.push(entity_type); }
      if (date_from) { conds.push(`a.uploaded_at >= $${pi++}::date`); params.push(date_from); }
      if (date_to) { conds.push(`a.uploaded_at < ($${pi++}::date + interval '1 day')`); params.push(date_to); }
      if (q) {
        conds.push(`(a.filename ILIKE $${pi} OR COALESCE(a.notes,'') ILIKE $${pi} OR COALESCE(e.memo,'') ILIKE $${pi} OR COALESCE(b.vendor_name,'') ILIKE $${pi})`);
        params.push(`%${q}%`);
        pi++;
      }

      const where = conds.join(" AND ");

      const countRes = await client.query(
        `SELECT COUNT(*)::text AS total
         FROM documents.attachments a
         LEFT JOIN accounting.expenses e ON e.id = a.entity_id AND a.entity_type = 'expense'
         LEFT JOIN accounting.bills b    ON b.id = a.entity_id AND a.entity_type = 'bill'
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
          a.r2_object_key,
          a.r2_bucket,
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
          b.vendor_name                  AS bill_vendor_name,
          b.status                       AS bill_status
        FROM documents.attachments a
        LEFT JOIN accounting.expenses e ON e.id = a.entity_id AND a.entity_type = 'expense'
        LEFT JOIN accounting.bills b    ON b.id = a.entity_id AND a.entity_type = 'bill'
        WHERE ${where}
        ORDER BY a.uploaded_at DESC
        LIMIT $${pi++} OFFSET $${pi++}`,
        params
      );

      return {
        total,
        limit,
        offset,
        items: listRes.rows.map((r: any) => ({
          id: r.id as string,
          entity_type: r.entity_type as string,
          entity_id: r.entity_id as string,
          filename: r.filename as string,
          content_type: r.content_type as string,
          size_bytes: Number(r.size_bytes),
          uploaded_at: r.uploaded_at as string,
          notes: r.notes as string | null,
          source: r.entity_type === "expense"
            ? {
                type: "expense" as const,
                expense_number: r.expense_number as string | null,
                date: r.expense_date as string | null,
                amount_cents: r.expense_amount_cents != null ? Number(r.expense_amount_cents) : null,
                memo: r.expense_memo as string | null,
                status: r.expense_status as string | null,
                detail_path: `/accounting/expenses/${r.entity_id}`,
              }
            : {
                type: "bill" as const,
                bill_number: r.bill_number as string | null,
                date: r.bill_date as string | null,
                amount_cents: r.bill_amount_cents != null ? Number(r.bill_amount_cents) : null,
                vendor_name: r.bill_vendor_name as string | null,
                status: r.bill_status as string | null,
                detail_path: `/accounting/bills/${r.entity_id}`,
              },
        })),
      };
    });
  });

  // DETAIL + presigned download URL
  app.get("/api/v1/accounting/receipts/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const paramsParsed = detailParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return validationError(reply, paramsParsed.error);

    const queryParsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!queryParsed.success) return validationError(reply, queryParsed.error);

    return withCompanyScope(user.uuid, queryParsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT id, entity_type, entity_id::text AS entity_id, filename, content_type,
                size_bytes::text AS size_bytes, r2_object_key, r2_bucket,
                uploaded_at::text AS uploaded_at, notes
         FROM documents.attachments
         WHERE id = $1 AND operating_company_id = $2
           AND category = 'receipt' AND is_deleted = false`,
        [paramsParsed.data.id, queryParsed.data.operating_company_id]
      );

      if (!res.rows[0]) return reply.code(404).send({ error: "not_found" });

      const row = res.rows[0] as {
        id: string; entity_type: string; entity_id: string; filename: string;
        content_type: string; size_bytes: string; r2_object_key: string;
        r2_bucket: string; uploaded_at: string; notes: string | null;
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
      };
    });
  });
}

export default fp(registerReceiptsRoutes);
