/**
 * UI-1 COMPLETE-BUILD — Integration Transactions
 * GET /api/v1/accounting/integration-transactions
 *
 * Unified view: integrations.qbo_sync_queue LEFT JOIN banking.bank_transactions.
 * QBO parity: equivalent to QBO > Accounting > Integration transactions (sync queue view).
 * READ-ONLY. No GL writes. Entity-scoped. Money in integer cents.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const SYNC_STATUSES = ["pending", "in_flight", "synced", "failed", "blocked"] as const;
const ENTITY_TYPES = ["bank_transaction", "bill", "expense", "invoice", "journal_entry"] as const;

const querySchema = companyQuerySchema.extend({
  sync_status: z
    .union([z.enum(SYNC_STATUSES), z.array(z.enum(SYNC_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  entity_type: z
    .union([z.enum(ENTITY_TYPES), z.array(z.enum(ENTITY_TYPES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

async function registerIntegrationTransactionsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/integration-transactions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, sync_status, entity_type, date_from, date_to, q, limit, offset } =
      parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const conds: string[] = ["q.operating_company_id = $1"];
      const params: unknown[] = [operating_company_id];
      let pi = 2;

      if (sync_status?.length) { conds.push(`q.sync_status = ANY($${pi++}::text[])`); params.push(sync_status); }
      if (entity_type?.length) { conds.push(`q.entity_type = ANY($${pi++}::text[])`); params.push(entity_type); }
      if (date_from) { conds.push(`q.created_at >= $${pi++}::date`); params.push(date_from); }
      if (date_to) { conds.push(`q.created_at < ($${pi++}::date + interval '1 day')`); params.push(date_to); }
      if (q) {
        conds.push(`(q.entity_id::text ILIKE $${pi} OR q.qbo_id ILIKE $${pi} OR COALESCE(bt.description,'') ILIKE $${pi} OR COALESCE(bt.merchant_name,'') ILIKE $${pi})`);
        params.push(`%${q}%`);
        pi++;
      }

      const where = conds.join(" AND ");

      const countRes = await client.query(
        `SELECT COUNT(*)::text AS total
         FROM integrations.qbo_sync_queue q
         LEFT JOIN banking.bank_transactions bt ON bt.id = q.entity_id AND q.entity_type = 'bank_transaction'
         WHERE ${where}`,
        params
      );
      const total = Number((countRes.rows[0] as { total: string }).total ?? 0);

      params.push(limit, offset);
      const listRes = await client.query(
        `SELECT
          q.id,
          q.entity_type,
          q.entity_id::text        AS entity_id,
          q.sync_status,
          q.qbo_id,
          q.attempt_count,
          q.last_attempt_at::text  AS last_attempt_at,
          q.next_attempt_at::text  AS next_attempt_at,
          q.synced_at::text        AS synced_at,
          q.error_message,
          q.created_at::text       AS created_at,
          bt.transaction_date::text AS txn_date,
          bt.description,
          bt.merchant_name,
          bt.amount_cents::text    AS amount_cents,
          bt.is_credit,
          bt.pending,
          bt.matched_load_id::text AS matched_load_id,
          bt.matched_bill_id::text AS matched_bill_id,
          bt.qbo_synced_at::text   AS qbo_synced_at
        FROM integrations.qbo_sync_queue q
        LEFT JOIN banking.bank_transactions bt ON bt.id = q.entity_id AND q.entity_type = 'bank_transaction'
        WHERE ${where}
        ORDER BY q.created_at DESC
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
          sync_status: r.sync_status as string,
          qbo_id: r.qbo_id as string | null,
          attempt_count: r.attempt_count as number,
          last_attempt_at: r.last_attempt_at as string | null,
          next_attempt_at: r.next_attempt_at as string | null,
          synced_at: r.synced_at as string | null,
          error_message: r.error_message as string | null,
          created_at: r.created_at as string,
          bank_transaction: r.txn_date != null ? {
            txn_date: r.txn_date as string,
            description: r.description as string | null,
            merchant_name: r.merchant_name as string | null,
            amount_cents: r.amount_cents != null ? Number(r.amount_cents) : null,
            is_credit: r.is_credit as boolean | null,
            pending: r.pending as boolean | null,
            matched_load_id: r.matched_load_id as string | null,
            matched_bill_id: r.matched_bill_id as string | null,
            qbo_synced_at: r.qbo_synced_at as string | null,
          } : null,
        })),
      };
    });
  });
}

export default fp(registerIntegrationTransactionsRoutes);
