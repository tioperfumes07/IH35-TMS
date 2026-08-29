import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const escrowQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.string().optional(),
});

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerBankingEscrowVisualizerRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/escrow-visualizer", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = escrowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      // BANK-F9515: this used to .catch(() => ({ rows: [] })) here, turning ANY query failure into a
      // normal 200 with an empty driver list — indistinguishable from "no drivers". Both mdata.drivers
      // and accounting.escrow_accounts (Block-23, migration 0234) are foundational tables, not
      // conditionally created, so there is no legitimate defensive reason for the swallow (same class
      // as BANK-F9514, #17030). DriverEscrowTabContent.tsx already derives its error UI from
      // useListState(escrowLedgerQuery, ...).isError — it just never fired because the backend never
      // returned an error status.
      const res = await client.query(
        // ACCT-F5703: driver_finance.escrow_balances is a separate, near-empty operational ledger
        // (1 row system-wide, live-confirmed 2026-08-21) that was never kept in sync with the real
        // GL-linked liability subledger, accounting.escrow_accounts (Block-23) — the same table
        // /accounting/escrow already reads correctly. Repointed here so this visualizer shows the
        // same balances the accounting page shows. Driver escrow legitimately persists for
        // separated/terminated drivers (escrow-separation.service.ts) — do NOT reinstate a
        // deactivated_at filter that would hide a real outstanding balance; instead surface every
        // active driver (regardless of balance) plus any deactivated driver who actually still has
        // an escrow account row.
        `
            SELECT
              d.id AS driver_id,
              CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
              COALESCE(ea.balance_cents, 0) / 100.0 AS escrow_balance
            FROM mdata.drivers d
            LEFT JOIN accounting.escrow_accounts ea
              ON ea.holder_id = d.id
              AND ea.holder_type = 'driver'
              AND ea.purpose = 'driver_bond'
              AND ea.operating_company_id = d.operating_company_id
            WHERE d.operating_company_id = $1::uuid
              AND (d.deactivated_at IS NULL OR ea.id IS NOT NULL)
            ORDER BY driver_name
          `,
        [q.operating_company_id]
      );
      return res.rows;
    });
    return { drivers: rows };
  });

  app.get("/api/v1/banking/escrow-visualizer/:driver_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = escrowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const timeline = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id, params.data.driver_id];
      const filters = [
        "ea.operating_company_id = $1::uuid",
        "ea.holder_id = $2",
        "ea.holder_type = 'driver'",
        "ea.purpose = 'driver_bond'",
      ];
      if (q.from) {
        values.push(q.from);
        filters.push(`ep.posted_at >= $${values.length}::timestamptz`);
      }
      if (q.to) {
        values.push(q.to);
        filters.push(`ep.posted_at <= $${values.length}::timestamptz`);
      }
      if (q.type) {
        values.push(q.type);
        filters.push(`ep.posting_type = $${values.length}`);
      }
      // ACCT-F5703: repointed off driver_finance.escrow_ledger (near-empty, never kept in sync) onto
      // accounting.escrow_postings — the real postings backing accounting.escrow_accounts.balance_cents,
      // already correctly linked to its GL journal entry via linked_journal_entry_id (no settlement-hop
      // join needed, unlike the prior driver_finance.escrow_ledger path which had no JE link of its own).
      // settlement_line_id has no equivalent on escrow_postings — honestly NULL, not fabricated, same
      // pattern this file already used for the (also-honest) NULL bucket dimension.
      //
      // BANK-F9515: this used to .catch(() => ({ rows: [] })) here too — same fake-empty-200 class as
      // the /escrow-visualizer list handler above, same fix.
      const res = await client.query(
        `
            SELECT
              ep.id,
              ea.holder_id AS driver_id,
              ep.posting_type AS entry_type,
              NULL::text AS bucket,
              (ep.amount_cents::numeric / 100) AS amount,
              ep.note AS memo,
              ep.posted_at AS created_at,
              CASE WHEN ep.source_type = 'driver_settlement' THEN ep.source_id::text ELSE NULL END AS settlement_id,
              NULL::text AS settlement_line_id,
              ep.linked_journal_entry_id::text AS journal_entry_id,
              je.entry_date::text AS journal_entry_date,
              je.memo AS journal_entry_memo
            FROM accounting.escrow_accounts ea
            JOIN accounting.escrow_postings ep
              ON ep.escrow_account_id = ea.id
             AND ep.operating_company_id = ea.operating_company_id
            LEFT JOIN accounting.journal_entries je
              ON je.id = ep.linked_journal_entry_id
             AND je.operating_company_id = ep.operating_company_id
            WHERE ${filters.join(" AND ")}
            ORDER BY ep.posted_at DESC
            LIMIT 500
          `,
        values
      );
      return res.rows;
    });
    return { timeline };
  });
}
