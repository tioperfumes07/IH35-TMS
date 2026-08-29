import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { dispatchNotification } from "../notifications/dispatcher.js";
import { requireAuth } from "../auth/session-middleware.js";
import { queuePaymentOnFinalize } from "./settlement-payment.service.js";
import { renderSettlementStatementPdf } from "./settlement-pdf-renderer.service.js";
import { notifySettlementAvailable } from "../services/push-notification.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { SETTLEMENT_DEDUCTION_SOURCE_TABLE } from "./deductions.service.js";

const settlementStatusSchema = z.enum([
  "draft",
  "presettle",
  "acked",
  "locked",
  "paid",
  "held",
  "cancelled",
  "final",
  "ready",
  "approved",
  "open",
  "closed",
]);
const paymentStateSchema = z.enum(["unpaid", "queued", "sent_to_bank", "cleared", "bounced", "manual_paid"]);
const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: settlementStatusSchema.optional(),
  payment_state: paymentStateSchema.optional(),
  driver_id: z.string().uuid().optional(),
});
const idParamsSchema = z.object({ id: z.string().uuid() });
const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  gross_pay: z.number().default(0),
  deductions_total: z.number().default(0),
  reimbursements_total: z.number().default(0),
  net_pay: z.number().default(0),
  // Gate-B sample tag. Defaults false so every ordinary settlement is real by default — a sample must
  // be asked for explicitly, never inherited. This is the ONLY tag path on this table: unlike every
  // other money create type, driver_settlements has no writable free-text field to hide a tag in.
  is_sample_data: z.boolean().default(false),
  lines: z.array(
    z.object({
      line_type: z.enum([
        "earnings",
        "extra_pay",
        "reimbursement",
        "deduction",
        "abandonment_chargeback",
        "team_split_primary",
        "team_split_secondary",
      ]),
      description: z.string().trim().max(500),
      amount: z.number(),
    })
  ).default([]),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

// ACCT-F5576: this file had ZERO role-based access control on any route -- authed() only requires a
// valid session, and assertCompanyMembership (via withCompany) checks org.user_accessible_company_ids(),
// which is role-agnostic (any company member, including a Driver, satisfies it). POST /settlements
// creates a real driver_finance.driver_settlements row with an attacker-chosen gross_pay/net_pay for
// any driver_id; PATCH /:id/finalize locks it AND calls queuePaymentOnFinalize -- an automatic REAL
// PAYMENT queue. Both were reachable by any authenticated company member. CLAUDE.md's own
// "DRIVER DEDUCTION AUTHORIZATION" note already documents the intent that acknowledge is "the COMPANY
// USER's sign-off" (i.e. NOT the driver) -- the code just never enforced it. Matches the role set
// settlements/approval.routes.ts already uses for the same domain's approve/reject/finalize operations.
const SETTLEMENT_WRITE_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant", "Payroll"]);
function requireSettlementWriteRole(req: FastifyRequest, reply: FastifyReply) {
  const user = authed(req, reply);
  if (!user) return null;
  const role = String((user as { role?: string }).role ?? "");
  if (!SETTLEMENT_WRITE_ROLES.has(role)) {
    reply.code(403).send({ error: "forbidden", detail: "settlement create/acknowledge/finalize requires an office role" });
    return null;
  }
  return user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

async function hasSettlementSchema(client: any) {
  const res = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

async function recomputeDebtSync(client: any, driverId: string) {
  // SAVEPOINT: missing/broken recompute_driver_debt must NOT abort the outer withCompany
  // transaction (Postgres 25P02). JS try/catch alone cannot recover an aborted txn.
  await client.query("SAVEPOINT recompute_debt_sync");
  try {
    const res = await client.query(
      `
        SELECT *
        FROM driver_finance.recompute_driver_debt($1::uuid)
      `,
      [driverId]
    );
    await client.query("RELEASE SAVEPOINT recompute_debt_sync");
    return res.rows[0] ?? null;
  } catch (recomputeErr) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT recompute_debt_sync");
    // intentional swallow: nested SAVEPOINT rollback failure must not abort outer txn cleanup
    } catch {
      /* nested rollback already failed — outer handler returns null below */
    }
    void recomputeErr;
    return null;
  }
}

export async function registerDriverFinanceSettlementRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-finance/settlements", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { rows: [], total: 0 };
      const values: unknown[] = [q.operating_company_id];
      const where = ["s.operating_company_id = $1::uuid"];
      if (q.status) {
        values.push(q.status);
        where.push(`s.status = $${values.length}`);
      }
      if (q.payment_state) {
        values.push(q.payment_state);
        where.push(`COALESCE(s.payment_state, 'unpaid') = $${values.length}`);
      }
      if (q.driver_id) {
        values.push(q.driver_id);
        where.push(`s.driver_id = $${values.length}::uuid`);
      }
      const countRes = await client.query(
        // CLS-JOIN-ENTITY-UNSCOPED: `where[0]` is always "s.operating_company_id = $1::uuid" (set
        // unconditionally above), so this is already scoped at runtime -- the static entity-scope
        // guard cannot see a predicate assembled through a JS array, only literal SQL text, so a
        // redundant AND s.operating_company_id = $1::uuid is added here directly so the guard (and
        // the next reader) can see the same fact the array already enforces.
        `SELECT count(*)::int AS cnt FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND ${where.join(" AND ")}`,
        values
      );
      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `
          SELECT
            v.*,
            COALESCE(s.payment_state, 'unpaid') AS payment_state,
            s.payment_queued_at,
            s.payment_sent_at,
            s.payment_cleared_at,
            s.payment_bank_reference,
            s.payment_bounced_reason,
            s.payment_method,
            (
              -- ACCT-F275 — count the covered loads through BOTH linkages, canonical first.
              --
              -- This counted db.load_id over an INNER JOIN on source_driver_bill_id, so a line that
              -- carries only the denormalized settlement_lines.load_id was DROPPED by the join and
              -- never counted. Live on prod br-fancy-credit-akjnd07a: S-20260808-0085 and
              -- S-20260808-0090 each cover one load and the screen reported load_count 0.
              --
              -- driver_bills.load_id stays CANONICAL (it is first in the COALESCE); sl.load_id is the
              -- denormalized fallback, and the join becomes LEFT so a line with no bill still counts.
              -- The COALESCE also gates the IS NOT NULL filter, or the fallback rows are discarded
              -- before they can be counted. Same rule and same COALESCE order as the ACCT-F290
              -- bookend CTE — one rule, two call sites, so the two cannot drift apart.
              SELECT COUNT(DISTINCT COALESCE(db.load_id, sl.load_id))::int
              FROM driver_finance.settlement_lines sl
              LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
              WHERE sl.settlement_id = s.id
                AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
            ) AS load_count,
            (
              -- P14 settlements load reverse-link: same COALESCE/JOIN rule as load_count directly
              -- above (never let the two drift apart — see that comment for the ACCT-F275 history),
              -- just returning the actual ids instead of counting them, so the FE can render a real
              -- EntityLink per covered load instead of a plain "N load(s)" count.
              SELECT array_agg(DISTINCT COALESCE(db.load_id, sl.load_id))
              FROM driver_finance.settlement_lines sl
              LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
              WHERE sl.settlement_id = s.id
                AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
            ) AS load_ids,
            (
              SELECT COALESCE(
                jsonb_agg(jsonb_build_object('id', linked.load_id::text, 'label', l.load_number) ORDER BY l.load_number),
                '[]'::jsonb
              )
              FROM (
                SELECT DISTINCT COALESCE(db.load_id, sl.load_id) AS load_id
                FROM driver_finance.settlement_lines sl
                LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
                WHERE sl.settlement_id = s.id
                  AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
              ) linked
              JOIN mdata.loads l
                ON l.id = linked.load_id
               AND l.operating_company_id = s.operating_company_id
            ) AS load_links
          FROM views.driver_settlement_with_debt v
          -- CLS-JOIN-ENTITY-UNSCOPED: same "where[0] already scopes s, guard can't see the array"
          -- note as the count query above; redundant AND s.operating_company_id = $1::uuid added
          -- directly on the join so it is visible as literal SQL, not only assembled JS.
          JOIN driver_finance.driver_settlements s ON s.id = v.id AND s.operating_company_id = $1::uuid
          WHERE ${where.join(" AND ")}
          ORDER BY v.period_start DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );

      // List can show cached/quick debt summary approximation.
      const rows = await Promise.all(
        rowsRes.rows.map(async (row: any) => {
          const debt = await recomputeDebtSync(client, String(row.driver_id));
          return {
            ...row,
            display_id: row.display_id ?? null,
            load_count: Number(row.load_count ?? 0),
            load_ids: Array.isArray(row.load_ids) ? (row.load_ids as unknown[]).map(String) : [],
            load_links: Array.isArray(row.load_links)
              ? (row.load_links as Array<{ id?: unknown; label?: unknown }>).map((link) => ({
                  id: String(link.id ?? ""),
                  label: String(link.label ?? ""),
                })).filter((link) => Boolean(link.id))
              : [],
            live_debt_flag: debt?.total_active_debt == null ? null : Number(debt.total_active_debt),
            debt_computed_at: debt?.computed_at ?? null,
            // LINK-F5187: debt.source_liabilities already carries the real driver_finance.driver_liabilities
            // ids behind live_debt_flag's dollar total (recompute_driver_debt's jsonb_agg) — every prior
            // reader of this endpoint (SettlementsTable's Debt Flag column, PreSettlementsPanel) discarded
            // them, rendering an honest-looking dollar amount with no drill to what actually makes it up.
            liability_ids: Array.isArray(debt?.source_liabilities)
              ? (debt.source_liabilities as Array<{ id?: unknown }>).map((s) => String(s?.id ?? "")).filter(Boolean)
              : [],
          };
        })
      );
      return { rows, total: Number((countRes.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0) };
    });
    return { settlements: payload.rows, total_count: payload.total };
  });

  // Reverse drill-through: list all historical settlements for a specific driver.
  // Path-based alias for GET /driver-finance/settlements?driver_id=X.
  // Powers the Driver detail "Settlements" tab — returns full history (all statuses).
  const driverIdParamSchema = z.object({ id: z.string().uuid() });
  const driverSettlementsQuerySchema = z.object({
    operating_company_id: z.string().uuid(),
    status: settlementStatusSchema.optional(),
    payment_state: paymentStateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });
  app.get("/api/v1/drivers/:id/settlements", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = driverIdParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = driverSettlementsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { rows: [], total: 0 };
      const values: unknown[] = [query.data.operating_company_id, params.data.id];
      const where = ["s.operating_company_id = $1::uuid", "s.driver_id = $2::uuid"];
      if (query.data.status) {
        values.push(query.data.status);
        where.push(`s.status = $${values.length}`);
      }
      if (query.data.payment_state) {
        values.push(query.data.payment_state);
        where.push(`COALESCE(s.payment_state, 'unpaid') = $${values.length}`);
      }
      const countRes = await client.query(
        // CLS-JOIN-ENTITY-UNSCOPED: `where[0]` is always "s.operating_company_id = $1::uuid" (set
        // unconditionally above), so this is already scoped at runtime -- the static entity-scope
        // guard cannot see a predicate assembled through a JS array, only literal SQL text, so a
        // redundant AND s.operating_company_id = $1::uuid is added here directly so the guard (and
        // the next reader) can see the same fact the array already enforces.
        `SELECT count(*)::int AS cnt FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND ${where.join(" AND ")}`,
        values
      );
      values.push(query.data.limit, query.data.offset);
      const rowsRes = await client.query(
        `
          SELECT
            v.*,
            COALESCE(s.payment_state, 'unpaid') AS payment_state,
            s.payment_queued_at,
            s.payment_sent_at,
            s.payment_cleared_at,
            s.payment_bank_reference,
            s.payment_bounced_reason,
            s.payment_method,
            (
              -- ACCT-F275 — count the covered loads through BOTH linkages, canonical first.
              --
              -- This counted db.load_id over an INNER JOIN on source_driver_bill_id, so a line that
              -- carries only the denormalized settlement_lines.load_id was DROPPED by the join and
              -- never counted. Live on prod br-fancy-credit-akjnd07a: S-20260808-0085 and
              -- S-20260808-0090 each cover one load and the screen reported load_count 0.
              --
              -- driver_bills.load_id stays CANONICAL (it is first in the COALESCE); sl.load_id is the
              -- denormalized fallback, and the join becomes LEFT so a line with no bill still counts.
              -- The COALESCE also gates the IS NOT NULL filter, or the fallback rows are discarded
              -- before they can be counted. Same rule and same COALESCE order as the ACCT-F290
              -- bookend CTE — one rule, two call sites, so the two cannot drift apart.
              SELECT COUNT(DISTINCT COALESCE(db.load_id, sl.load_id))::int
              FROM driver_finance.settlement_lines sl
              LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
              WHERE sl.settlement_id = s.id
                AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
            ) AS load_count,
            (
              -- P14 settlements load reverse-link: same COALESCE/JOIN rule as load_count directly
              -- above (never let the two drift apart — see that comment for the ACCT-F275 history),
              -- just returning the actual ids instead of counting them, so the FE can render a real
              -- EntityLink per covered load instead of a plain "N load(s)" count.
              SELECT array_agg(DISTINCT COALESCE(db.load_id, sl.load_id))
              FROM driver_finance.settlement_lines sl
              LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
              WHERE sl.settlement_id = s.id
                AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
            ) AS load_ids,
            (
              SELECT COALESCE(
                jsonb_agg(jsonb_build_object('id', linked.load_id::text, 'label', l.load_number) ORDER BY l.load_number),
                '[]'::jsonb
              )
              FROM (
                SELECT DISTINCT COALESCE(db.load_id, sl.load_id) AS load_id
                FROM driver_finance.settlement_lines sl
                LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
                WHERE sl.settlement_id = s.id
                  AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
              ) linked
              JOIN mdata.loads l
                ON l.id = linked.load_id
               AND l.operating_company_id = s.operating_company_id
            ) AS load_links
          FROM views.driver_settlement_with_debt v
          -- CLS-JOIN-ENTITY-UNSCOPED: same "where[0] already scopes s, guard can't see the array"
          -- note as the count query above; redundant AND s.operating_company_id = $1::uuid added
          -- directly on the join so it is visible as literal SQL, not only assembled JS.
          JOIN driver_finance.driver_settlements s ON s.id = v.id AND s.operating_company_id = $1::uuid
          WHERE ${where.join(" AND ")}
          ORDER BY v.period_start DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );
      const rows = await Promise.all(
        rowsRes.rows.map(async (row: any) => {
          const debt = await recomputeDebtSync(client, String(row.driver_id));
          return {
            ...row,
            display_id: row.display_id ?? null,
            load_count: Number(row.load_count ?? 0),
            load_ids: Array.isArray(row.load_ids) ? (row.load_ids as unknown[]).map(String) : [],
            load_links: Array.isArray(row.load_links)
              ? (row.load_links as Array<{ id?: unknown; label?: unknown }>).map((link) => ({
                  id: String(link.id ?? ""),
                  label: String(link.label ?? ""),
                })).filter((link) => Boolean(link.id))
              : [],
            live_debt_flag: debt?.total_active_debt == null ? null : Number(debt.total_active_debt),
            debt_computed_at: debt?.computed_at ?? null,
            // LINK-F5187: same fix as the company-wide list above — thread the real liability ids
            // through instead of discarding them after the dollar total is computed.
            liability_ids: Array.isArray(debt?.source_liabilities)
              ? (debt.source_liabilities as Array<{ id?: unknown }>).map((s) => String(s?.id ?? "")).filter(Boolean)
              : [],
          };
        })
      );
      return { rows, total: Number((countRes.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0) };
    });
    return { settlements: payload.rows, total_count: payload.total };
  });

  app.get("/api/v1/driver-finance/settlements/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const detail = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };
      const res = await client.query(
        `
          SELECT
            v.*,
            COALESCE(s.payment_state, 'unpaid') AS payment_state,
            s.payment_queued_at,
            s.payment_sent_at,
            s.payment_cleared_at,
            s.payment_bank_reference,
            s.payment_bounced_reason,
            s.payment_method,
            -- Bookend reverse links (open pre-settlements often have 0 settlement_lines yet):
            -- views.driver_settlement_with_debt does not expose first/last_load_*.
            s.first_load_id,
            s.first_load_number,
            s.last_load_id,
            s.last_load_number
          FROM views.driver_settlement_with_debt v
          JOIN driver_finance.driver_settlements s ON s.id = v.id
          WHERE v.id = $1 AND s.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const row = res.rows[0];
      if (!row) return null;
      const linesRes = await client.query(
        `
          -- LV-SETTLEMENT-LOAD-FK (F-06). This was SELECT *, which returns settlement_lines.load_id and
          -- nothing a human can read — load_number lives on mdata.loads, so the settlement detail handed
          -- the UI a raw uuid for the one field that says WHICH LOAD the driver is being paid for.
          -- PROD-VERIFIED 2026-08-11 (USMCA, control healthy at 4 lines / 8 settlements): the link is
          -- real and resolvable — S-20260808-0085 -> L-20260808-0085 and S-20260808-0090 ->
          -- L-20260808-0090. S-2026-0001's two lines carry NO load_id at all, so load_number stays NULL
          -- there by construction and the UI must say so honestly rather than invent a link.
          -- Entity-scoped join: mdata.loads carries operating_company_id, and the settlement is already
          -- constrained to $2 above, so a load from another entity can never resolve into this payload.
          --
          -- SETTLEMENT-DETAIL-LOAD-COALESCE-DRIFT — this joined mdata.loads on sl.load_id ALONE, so a
          -- line reachable only through its driver bill (source_driver_bill_id set, sl.load_id NULL)
          -- rendered "LOADS IN CYCLE —" here while the LIST endpoint (settlements.routes.ts:157-173),
          -- which already resolves COALESCE(db.load_id, sl.load_id), reported load_count 1 for the same
          -- settlement — one rule, two call sites, drifted apart. Bill-first COALESCE, identical order
          -- and LEFT-JOIN shape to the list query (ACCT-F275), closes the second call site. The trailing
          -- COALESCE(db.load_id, sl.load_id) AS load_id overrides sl.*'s raw load_id column (later
          -- columns win by name in the driver's row object) so the existing frontend read of
          -- line.load_id resolves correctly with zero UI changes — no data mutation, read-path only.
          -- HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID: a 'deduction' line's real backing record is
          -- driver_finance.driver_settlement_deductions, reachable through source_table/
          -- source_reference_id (stamped at apply-time by settlement-deduction-cap.service.ts, same
          -- PR). Joined here, entity-pinned via dsd.operating_company_id = $2, so the UI's Hold
          -- action can target the real deduction id instead of this line's own id, and can show its
          -- REAL held state (dsd.is_held) instead of a column that never existed on this table.
          SELECT
            sl.*,
            l.load_number,
            COALESCE(db.load_id, sl.load_id) AS load_id,
            dsd.id AS source_deduction_id,
            dsd.is_held AS deduction_is_held,
            dsd.hold_until_period AS deduction_hold_until_period,
            dsd.hold_reason AS deduction_hold_reason,
            dsd.held_by_user_id AS deduction_held_by_user_id,
            hu.email AS deduction_held_by_user_email
          FROM driver_finance.settlement_lines sl
          LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
          LEFT JOIN mdata.loads l
            ON l.id = COALESCE(db.load_id, sl.load_id)
           AND l.operating_company_id = $2::uuid
          LEFT JOIN driver_finance.driver_settlement_deductions dsd
            ON dsd.id = sl.source_reference_id
           AND sl.source_table = $3
           AND dsd.operating_company_id = $2::uuid
          LEFT JOIN identity.users hu ON hu.id = dsd.held_by_user_id
          WHERE sl.settlement_id = $1
          ORDER BY sl.created_at ASC
        `,
        [params.data.id, companyId, SETTLEMENT_DEDUCTION_SOURCE_TABLE]
      );
      const debt = await recomputeDebtSync(client, String(row.driver_id));
      // AP_BILL / GL_JE column-wave: settlement-bill-payment-posting.service.ts (flag
      // SETTLEMENT_GL_POSTING_ENABLED, live for all 3 entities since 2026-07-26) already writes a
      // real, queryable link per driver bill funded by this settlement — driver_settlement_gl_bills
      // (accounting_bill_id, bill_journal_entry_id) — but no settlement read path ever selected it.
      // Confirmed reachable, not academic: this table is populated whenever the flag is on, which it
      // is; a settlement detail page reader had no way to see or drill into the real bills/JEs its
      // own posting created.
      // BANK-F9522: this used to .catch(() => ({ rows: [] })) — same fake-empty class as the banking
      // silent-catch sweep (BANK-F9514-9518/9520). driver_finance.driver_settlement_gl_bills is
      // foundational (migration 202607060900) and populated whenever SETTLEMENT_GL_POSTING_ENABLED is
      // on, which it is for all 3 entities — a query failure here is real, not "table doesn't exist
      // yet". This whole detail payload already flows through SettlementDetailPage.tsx's
      // detailQuery.isError early-return (its own DETAILQUERY-SILENT-FALSE-EMPTY comment documents
      // exactly this defect class for the settlement detail route as a whole) — letting the failure
      // propagate is what makes that existing error UI reachable for this specific query too.
      const linkedBillsRes = await client.query(
        `
            SELECT accounting_bill_id::text, bill_journal_entry_id::text, load_number
            FROM driver_finance.driver_settlement_gl_bills
            WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid
            ORDER BY created_at ASC
          `,
        [params.data.id, companyId]
      );
      return {
        ...row,
        lines: linesRes.rows,
        debt_summary: debt,
        linked_bills: linkedBillsRes.rows,
      };
    });
    if (detail && "unavailable" in detail) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (!detail) return reply.code(404).send({ error: "settlement_not_found" });
    return detail;
  });

  // LOAD-SETTLEMENT-TAB-SHOWS-OPEN-NOT-SETTLING — the load→settlement REVERSE hop. Before this route,
  // nothing resolved "which settlement actually covers load X" — the load drawer's Settlement tab
  // called a DRIVER-scoped "open pre-settlement" lookup instead, so a load already paid on a LOCKED
  // settlement showed the driver's separate, unrelated, empty open cycle. Same bill-first
  // COALESCE(db.load_id, sl.load_id) resolution the settlement detail route above already uses
  // (SETTLEMENT-DETAIL-LOAD-COALESCE-DRIFT) — reused here, not reinvented, so the two call sites can
  // never drift apart on which load a settlement line covers.
  app.get("/api/v1/driver-finance/settlements/for-load/:loadId", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ loadId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };
      const res = await client.query(
        `
          SELECT DISTINCT
            s.id::text AS settlement_id,
            s.display_id,
            s.status::text AS status,
            s.gross_pay,
            s.net_pay,
            s.locked_at,
            s.paid_at
          FROM driver_finance.settlement_lines sl
          LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
          JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
          WHERE COALESCE(db.load_id, sl.load_id) = $1::uuid
            AND s.operating_company_id = $2::uuid
          ORDER BY s.locked_at DESC NULLS LAST, settlement_id DESC
        `,
        [params.data.loadId, companyId]
      );
      return { settlements: res.rows };
    });
    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    return result;
  });

  app.get("/api/v1/driver-finance/settlements/:id/pdf", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    try {
      const result = await withCompany(user.uuid, companyId, async (client) =>
        renderSettlementStatementPdf(client, {
          operatingCompanyId: companyId,
          settlementId: params.data.id,
        })
      );
      reply.header("Content-Type", result.mimeType);
      reply.header("Content-Disposition", `inline; filename="${result.filename}"`);
      reply.header("X-Settlement-Pdf-Sha256", result.sha256);
      return reply.send(result.pdfBuffer);
    } catch (error) {
      const message = String((error as Error).message ?? "settlement_pdf_generation_failed");
      if (message === "settlement_not_found") return reply.code(404).send({ error: message });
      return reply.code(500).send({ error: "settlement_pdf_generation_failed" });
    }
  });

  app.post("/api/v1/driver-finance/settlements", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireSettlementWriteRole(req, reply);
    if (!user) return;
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const created = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };

      // ACCT-F5576: driver_id was previously trusted outright and INSERTed with zero check it exists
      // or belongs to this company -- a real driver_finance.driver_settlements row (real
      // gross_pay/net_pay dollar amounts) could be fabricated against a foreign or nonexistent driver.
      const driverRes = await client.query(
        `SELECT id FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [body.driver_id, body.operating_company_id]
      );
      if (!driverRes.rows[0]) return { driverNotFound: true as const };

      const displayRes = await client.query(
        `SELECT driver_finance.next_settlement_display_id($1::uuid, $2::date) AS next_id`,
        [body.operating_company_id, body.period_start]
      );
      const displayId = (displayRes.rows[0] as { next_id?: string } | undefined)?.next_id ?? `S-${new Date(body.period_start).getFullYear()}-0001`;

      const settlementRes = await client.query(
        `
          INSERT INTO driver_finance.driver_settlements (
            operating_company_id, display_id, driver_id, period_start, period_end, status,
            gross_pay, deductions_total, reimbursements_total, net_pay, is_sample_data
          )
          VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9,$10)
          RETURNING *
        `,
        [
          body.operating_company_id,
          displayId,
          body.driver_id,
          body.period_start,
          body.period_end,
          body.gross_pay,
          body.deductions_total,
          body.reimbursements_total,
          body.net_pay,
          body.is_sample_data,
        ]
      );
      const settlement = settlementRes.rows[0];

      for (const line of body.lines) {
        await client.query(
          `
            INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
            VALUES ($1,$2,$3,$4)
          `,
          [settlement.id, line.line_type, line.description, line.amount]
        );
      }
      return settlement;
    });

    if ("unavailable" in created) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("driverNotFound" in created) return reply.code(404).send({ error: "driver_not_found" });

    void notifySettlementAvailable({
      operatingCompanyId: body.operating_company_id,
      driverId: body.driver_id,
      settlementId: String((created as { id: string }).id),
      displayId: (created as { display_id?: string | null }).display_id ?? null,
    }).catch(() => undefined);

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/driver-finance/settlements/:id/acknowledge", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireSettlementWriteRole(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const ifMatch = req.headers["if-match"];
    const etagToken = typeof ifMatch === "string" ? ifMatch.replaceAll('"', "") : null;

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };
      const currentRes = await client.query(
        `SELECT id, acknowledged_at, acknowledged_by_user_id, updated_at FROM driver_finance.driver_settlements WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, companyId]
      );
      const current = currentRes.rows[0];
      if (!current) return { notFound: true as const };
      const expectedEtag = crypto.createHash("sha1").update(String(current.updated_at ?? "")).digest("hex");
      if (etagToken && etagToken !== expectedEtag) return { conflict: true as const, expectedEtag };

      const updateRes = await client.query(
        `
          UPDATE driver_finance.driver_settlements
          SET acknowledged_at = now(), acknowledged_by_user_id = $2, status = CASE WHEN status = 'presettle' THEN 'acked' ELSE status END
          WHERE id = $1
          RETURNING *
        `,
        [params.data.id, user.uuid]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.settlement_acknowledged",
        {
          resource_type: "driver_finance.driver_settlements",
          resource_id: params.data.id,
        },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0], expectedEtag };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "settlement_not_found" });
    if ("conflict" in result) return reply.code(412).send({ error: "etag_conflict", expected_etag: result.expectedEtag });
    reply.header("ETag", `"${result.expectedEtag}"`);
    return result.row;
  });

  app.patch("/api/v1/driver-finance/settlements/:id/finalize", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireSettlementWriteRole(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };
      const currentRes = await client.query(
        `SELECT s.*, v.has_pending_acks FROM driver_finance.driver_settlements s JOIN views.driver_settlement_with_debt v ON v.id = s.id WHERE s.id = $1 AND s.operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, companyId]
      );
      const current = currentRes.rows[0];
      if (!current) return { notFound: true as const };
      if (current.has_pending_acks) return { blocked: true as const, reason: "pending_acknowledgments" };
      if (!current.acknowledged_at) return { blocked: true as const, reason: "acknowledgment_required" };

      const debt = await recomputeDebtSync(client, String(current.driver_id));
      const computedAt = debt?.computed_at ? new Date(String(debt.computed_at)).getTime() : 0;
      if (computedAt && Date.now() - computedAt > 5000) return { blocked: true as const, reason: "debt_stale_refresh_required" };

      const updateRes = await client.query(
        `UPDATE driver_finance.driver_settlements SET status = 'locked', locked_at = now() WHERE id = $1 RETURNING *`,
        [params.data.id]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.settlement_finalized",
        { resource_type: "driver_finance.driver_settlements", resource_id: params.data.id },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0] };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "settlement_not_found" });
    if ("blocked" in result) return reply.code(409).send({ error: "finalize_blocked", reason: result.reason });

    void withLuciaBypass(async (client) => {
      const rowRes = await client.query(
        `
          SELECT
            s.id,
            s.display_id,
            s.operating_company_id,
            s.period_start,
            s.period_end,
            s.net_pay,
            d.email,
            d.first_name,
            d.last_name,
            d.identity_user_id,
            d.phone
          FROM driver_finance.driver_settlements s
          JOIN mdata.drivers d ON d.id = s.driver_id AND d.operating_company_id = s.operating_company_id
          WHERE s.id = $1
            AND s.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const row = rowRes.rows[0] as Record<string, unknown> | undefined;
      if (!row?.operating_company_id) return;

      const driverName =
        `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim() || "Driver";
      const settlementLabel = `${String(row.display_id ?? row.id)} (${String(row.period_start ?? "").slice(0, 10)} → ${String(
        row.period_end ?? ""
      ).slice(0, 10)})`;
      const amountLabel = row.net_pay != null ? `USD ${Number(row.net_pay).toFixed(2)}` : "";
      const settlementNo = String(row.display_id ?? row.id);
      const net = row.net_pay != null ? Number(row.net_pay).toFixed(2) : "";
      const oc = String(row.operating_company_id);
      const baseUrl = process.env.FRONTEND_BASE_URL?.replace(/\/$/, "") ?? "";
      const driverLink = baseUrl ? `${baseUrl}/driver` : "";

      const identityUserId = row.identity_user_id ? String(row.identity_user_id) : "";
      const phone = row.phone ? String(row.phone).trim() : "";

      if (identityUserId) {
        await dispatchNotification({
          user_id: identityUserId,
          event_type: "settlement.created",
          actor_user_id: user.uuid,
          payload: {
            operating_company_id: oc,
            driverName,
            settlementLabel,
            amountLabel,
            settlement_no: settlementNo,
            net,
            link: driverLink,
            sms_to: phone,
            whatsapp_to: phone,
          },
        });
        return;
      }

      const email = row.email ? String(row.email).trim() : "";
      if (!email) return;

      await enqueueEmail({
        operatingCompanyId: oc,
        toAddresses: [email],
        subject: `Settlement ready — ${String(row.display_id ?? "settlement")}`,
        templateKey: "settlement-ready",
        templateVars: {
          driverName,
          settlementLabel,
          amountLabel,
        },
        queuedByUserId: user.uuid,
      });
    }).catch(() => undefined);

    const queueResult = await queuePaymentOnFinalize(params.data.id, companyId, user.uuid).catch((error) => ({
      queued: false as const,
      reason: String((error as Error)?.message ?? "queue_payment_failed"),
    }));
    return { ...result.row, payment_auto_queue: queueResult };
  });
}
