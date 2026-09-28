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

// ROUND 197.1 (owner-raised) — QuickBooks-parity filter panel for the Driver Escrow tab. Every
// field here maps to a REAL column: posting_type is the escrow_postings CHECK-constrained enum
// (deposit/release/adjustment/forfeiture, verified live), driver_ids is real mdata.drivers rows,
// amount_min/max are amount_cents, cleared maps to linked_journal_entry_id IS NOT NULL (the one
// real binary "posted to GL vs not" state this table has — escrow_postings carries no
// voided_at/status column, so this is the closest honest analog to QBO's C/R cleared status, not
// an invented one). No field here was added without a real column backing it.
const escrowLedgerQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  driver_ids: z.string().optional(), // comma-separated uuids; omitted/empty = every driver
  types: z.string().optional(), // comma-separated posting_type values; omitted/empty = every type
  amount_min_cents: z.coerce.number().int().nonnegative().optional(),
  amount_max_cents: z.coerce.number().int().nonnegative().optional(),
  cleared: z.enum(["cleared", "uncleared"]).optional(), // omitted = both
  // "Status" per the owner's QBO-parity ask — grounded in accounting.escrow_accounts.status
  // ('active'|'closed', the real CHECK-constrained column), a per-driver-account state, distinct
  // from the per-posting "cleared" state above.
  account_status: z.enum(["active", "closed"]).optional(),
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
            JOIN accounting.escrow_ledger ep
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

  // ROUND 197.1 — company-wide, fully-filterable escrow ledger. Distinct from the per-driver
  // /:driver_id timeline above (kept unchanged; still used by driverFinance.ts/Drivers.tsx call
  // sites this route does not touch): this one drives DriverEscrowTabContent's QuickBooks-parity
  // filter panel, spans every driver (or a chosen multi-select subset), and the returned
  // `total_amount_cents` is computed from the SAME filtered WHERE clause as the rows — so the
  // header total always matches what is actually on screen, never the unfiltered account total.
  app.get(
    "/api/v1/banking/escrow-visualizer/ledger",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = escrowLedgerQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const q = query.data;

      const driverIds = (q.driver_ids ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const types = (q.types ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
        const values: unknown[] = [q.operating_company_id];
        const filters = ["ea.operating_company_id = $1::uuid", "ea.holder_type = 'driver'", "ea.purpose = 'driver_bond'"];
        if (driverIds.length > 0) {
          values.push(driverIds);
          filters.push(`ea.holder_id = ANY($${values.length}::uuid[])`);
        }
        if (q.from) {
          values.push(q.from);
          filters.push(`ep.posted_at >= $${values.length}::timestamptz`);
        }
        if (q.to) {
          values.push(q.to);
          filters.push(`ep.posted_at <= $${values.length}::timestamptz`);
        }
        if (types.length > 0) {
          values.push(types);
          filters.push(`ep.posting_type = ANY($${values.length}::text[])`);
        }
        if (q.amount_min_cents != null) {
          values.push(q.amount_min_cents);
          filters.push(`ep.amount_cents >= $${values.length}`);
        }
        if (q.amount_max_cents != null) {
          values.push(q.amount_max_cents);
          filters.push(`ep.amount_cents <= $${values.length}`);
        }
        if (q.cleared === "cleared") filters.push("ep.linked_journal_entry_id IS NOT NULL");
        if (q.cleared === "uncleared") filters.push("ep.linked_journal_entry_id IS NULL");
        if (q.account_status) {
          values.push(q.account_status);
          filters.push(`ea.status = $${values.length}`);
        }

        const whereSql = filters.join(" AND ");
        const rowsRes = await client.query(
          `
            SELECT
              ep.id,
              ea.holder_id AS driver_id,
              -- ROUND 197.1 follow-up (2026-09-28) — d LEFT JOIN, not INNER: live-caught a real
              -- cross-entity mismatch (escrow_accounts.holder_id ALFONSO HIDALGO CHAVEZ resolves
              -- to a driver row scoped to a DIFFERENT operating_company_id than the escrow account
              -- itself, so it never satisfied the entity-scoped INNER JOIN). The prior INNER JOIN
              -- silently dropped 6 real postings from the row list while the separate total-count
              -- query (no driver join) still counted them -- a 230-vs-224 mismatch a human would
              -- read as "the list is just short," not as a hidden defect. NULL is now surfaced
              -- honestly instead of hidden; this does not fix the underlying cross-entity data
              -- question (out of scope here, flagged separately), it stops silently hiding it.
              CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
              ep.posting_type AS entry_type,
              (ep.amount_cents::numeric / 100) AS amount,
              ep.note AS memo,
              ep.posted_at AS created_at,
              CASE WHEN ep.source_type = 'driver_settlement' THEN ep.source_id::text ELSE NULL END AS settlement_id,
              -- BANK-F5751/F6050 class (same law escrow-visualizer's own /:driver_id timeline and
              -- banking.routes.ts's register "escrow" branch already follow) — the Settlement
              -- column must show a real human document number, never a bare UUID behind a generic
              -- "Settlement" fallback label. P0-B (Lead, 2026-09-22/23): source_document_ref is the
              -- canonical AlwaysTrack settlement number; the old synthetic display_id counter is
              -- retired as the user-facing label.
              ds.source_document_ref AS settlement_display_id,
              ep.linked_journal_entry_id::text AS journal_entry_id,
              je.entry_date::text AS journal_entry_date,
              je.memo AS journal_entry_memo,
              (ep.linked_journal_entry_id IS NOT NULL) AS cleared
            FROM accounting.escrow_accounts ea
            JOIN accounting.escrow_postings ep
              ON ep.escrow_account_id = ea.id
             AND ep.operating_company_id = ea.operating_company_id
            LEFT JOIN driver_finance.driver_settlements ds
              ON ds.id = ep.source_id
             AND ep.source_type = 'driver_settlement'
             AND ds.operating_company_id = ep.operating_company_id
            LEFT JOIN mdata.drivers d
              ON d.id = ea.holder_id
             AND d.operating_company_id = ea.operating_company_id
            LEFT JOIN accounting.journal_entries je
              ON je.id = ep.linked_journal_entry_id
             AND je.operating_company_id = ep.operating_company_id
            WHERE ${whereSql}
            ORDER BY ep.posted_at DESC
            LIMIT 1000
          `,
          values
        );
        // Same WHERE clause, no LIMIT — the header total this powers must reflect every matching
        // row, not just the page of rows rendered (law section 8: a filtered header showing the
        // unfiltered number is a lie; equally, a total truncated to LIMIT 1000 would be a quieter
        // version of the same lie).
        const totalRes = await client.query<{ total_amount_cents: string; total_count: string }>(
          `
            SELECT
              COALESCE(SUM(ep.amount_cents), 0)::text AS total_amount_cents,
              COUNT(*)::text AS total_count
            FROM accounting.escrow_accounts ea
            JOIN accounting.escrow_postings ep
              ON ep.escrow_account_id = ea.id
             AND ep.operating_company_id = ea.operating_company_id
            WHERE ${whereSql}
          `,
          values
        );
        return {
          rows: rowsRes.rows,
          total_amount_cents: Number(totalRes.rows[0]?.total_amount_cents ?? 0),
          total_count: Number(totalRes.rows[0]?.total_count ?? 0),
        };
      });
      return result;
    }
  );
}
