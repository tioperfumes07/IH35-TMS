import { openWorkOrderPredicate } from "../kpi/canonical-kpis.js";
// FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): the same shared exclusion already required
// on the Fleet roster/KPI (mdata/fleet-visibility.ts) applies here too — a fixture unit must not
// inflate the Office HOME Fleet Snapshot's total-units denominator.
import { excludeDemoPhantomSql, excludeSampleDataSql } from "../mdata/fleet-visibility.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  countDriversOnActiveLoads,
} from "../kpi/canonical-kpis.js";
import { getOpenLoadsBreakdown } from "../dispatch/active-loads-count.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "../banking/bank-account-visibility.js";
import {
  computeRevenueGlLinkage,
  todayRevenueWindow,
  weeklyRevenueWindow,
  revenueRangeWindow,
  HOME_KPI_RANGES,
  type RevenueGlLinkageResult,
} from "./revenue-gl-linkage.service.js";
import {
  computeFactoringBalanceInvoiceLinkage,
  type FactoringBalanceInvoiceLinkageResult,
} from "./factoring-balance-invoice-linkage.service.js";

function revenuePayload(result: RevenueGlLinkageResult) {
  return {
    status: result.status,
    unverifiable_reason: result.unverifiable_reason,
    period: result.period,
    basis: result.basis,
    invoice_basis_cents: result.invoice_basis_cents,
    gl_posted_revenue_cents: result.gl_posted_revenue_cents,
    // Backward-compat headline — null when unverifiable (never fabricate $0).
    revenue_cents: result.revenue_cents,
    discrepancy_count: result.discrepancy_count,
    discrepancy_cents: result.discrepancy_cents,
    drill: result.drill,
  };
}

function factoringBalancePayload(result: FactoringBalanceInvoiceLinkageResult) {
  return {
    status: result.status,
    unverifiable_reason: result.unverifiable_reason,
    outstanding_liability_cents: result.outstanding_liability_cents,
    reserve_receivable_cents: result.reserve_receivable_cents,
    invoice_count: result.invoice_count,
    invoices_factored: result.invoice_count,
    funded_cents: result.funded_cents,
    settled_cents: result.settled_cents,
    recourse_buyback_cents: result.recourse_buyback_cents,
    funded_advance_count: result.funded_advance_count,
    diagnostics: result.diagnostics,
    meta: result.meta,
    // Backward-compat aliases — null when unverifiable/accounting_exception (never fabricate $0).
    // outstanding_cents = LIABILITY (owner 2026-07-19); reserveCents stays reserve asset.
    outstanding_cents: result.outstanding_liability_cents,
    reserveCents: result.reserve_receivable_cents,
    advancedCents: result.outstanding_liability_cents,
    // NEVER reserve + liability (owner: never net). Headline = outstanding liability only.
    totalCents: result.outstanding_liability_cents,
  };
}

function officeRole(role: string) {
  return role !== "Driver";
}

// ACCT-R-07 (0280-42-wo-to-expense-flow): canonical WO status buckets, shared by the WO count
// query AND the linked bill/expense economics query below so both aggregations classify a raw
// maintenance.work_orders.status the same way (a single source of truth for the bucket mapping).
const WO_STATUS_BUCKET_KEYS = [
  "draft",
  "open",
  "in_progress",
  "awaiting_parts",
  "completed",
  "cancelled",
  "unknown",
] as const;
type WoStatusBucket = (typeof WO_STATUS_BUCKET_KEYS)[number];

function bucketizeWoStatus(raw: unknown): WoStatusBucket {
  const k = String(raw ?? "").toLowerCase();
  if (k === "draft") return "draft";
  if (k === "open") return "open";
  if (k.includes("progress")) return "in_progress";
  if (k.includes("await") || k.includes("parts")) return "awaiting_parts";
  if (k.includes("complete")) return "completed";
  if (k.includes("cancel")) return "cancelled";
  return "unknown";
}

type SimpleClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

async function relationExists(client: SimpleClient, qualifiedName: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [qualifiedName]);
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(client: SimpleClient, schema: string, table: string, column: string): Promise<boolean> {
  const res = await client.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

type WoLinkedEconomicsBucket = {
  bill_count: number;
  bill_amount_cents: number;
  expense_count: number;
  expense_amount_cents: number;
};

type WoLinkedEconomics =
  | {
      status: "ok";
      buckets: Record<WoStatusBucket, WoLinkedEconomicsBucket>;
      wo_with_expense_flow_count: number;
      total_linked_bill_amount_cents: number;
      total_linked_expense_amount_cents: number;
    }
  | { status: "unverifiable"; unverifiable_reason: string };

function emptyLinkedEconomicsBuckets(): Record<WoStatusBucket, WoLinkedEconomicsBucket> {
  const buckets = {} as Record<WoStatusBucket, WoLinkedEconomicsBucket>;
  for (const k of WO_STATUS_BUCKET_KEYS) {
    buckets[k] = { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 };
  }
  return buckets;
}

/**
 * ACCT-R-07 (0280-42-wo-to-expense-flow): the WO status-count widget previously counted work
 * orders only — it had no join to the accounting side, so a user could not see whether the WOs
 * driving a status bucket had actually produced a bill/expense. This joins
 * maintenance.work_orders -> accounting.bills / accounting.expenses via the canonical
 * linked_work_order_uuid FK (migration 202607050810_wo_bill_expense_hard_fk_link.sql; hardened
 * from a soft/memo-only link to a real FK) — never invented columns, always to_regclass/
 * information_schema-verified before the join runs. Two separate GROUP BY queries (not one join)
 * so a WO with N bills AND M expenses cannot fan-out and double-count either side's SUM.
 * Voided/reversed documents (accounting.bills.revoked_at, accounting.expenses.voided_at) are
 * excluded — a reversed bill/expense is not live economics.
 */
async function computeWoLinkedEconomics(
  client: SimpleClient,
  operatingCompanyId: string
): Promise<WoLinkedEconomics> {
  const [woOk, billsOk, expensesOk] = await Promise.all([
    relationExists(client, "maintenance.work_orders"),
    relationExists(client, "accounting.bills"),
    relationExists(client, "accounting.expenses"),
  ]);
  if (!woOk) return { status: "unverifiable", unverifiable_reason: "maintenance.work_orders not present" };
  if (!billsOk && !expensesOk) {
    return { status: "unverifiable", unverifiable_reason: "accounting.bills and accounting.expenses not present" };
  }

  const [billsLinkCol, billsAmountCol, billsRevokedCol, expensesLinkCol, expensesAmountCol, expensesVoidedCol] =
    await Promise.all([
      billsOk ? columnExists(client, "accounting", "bills", "linked_work_order_uuid") : Promise.resolve(false),
      billsOk ? columnExists(client, "accounting", "bills", "amount_cents") : Promise.resolve(false),
      billsOk ? columnExists(client, "accounting", "bills", "revoked_at") : Promise.resolve(false),
      expensesOk ? columnExists(client, "accounting", "expenses", "linked_work_order_uuid") : Promise.resolve(false),
      expensesOk ? columnExists(client, "accounting", "expenses", "total_amount_cents") : Promise.resolve(false),
      expensesOk ? columnExists(client, "accounting", "expenses", "voided_at") : Promise.resolve(false),
    ]);

  const canJoinBills = billsOk && billsLinkCol && billsAmountCol;
  const canJoinExpenses = expensesOk && expensesLinkCol && expensesAmountCol;
  if (!canJoinBills && !canJoinExpenses) {
    return {
      status: "unverifiable",
      unverifiable_reason: "linked_work_order_uuid/amount columns not present on accounting.bills or accounting.expenses",
    };
  }

  const buckets = emptyLinkedEconomicsBuckets();
  let totalBillCents = 0;
  let totalExpenseCents = 0;

  if (canJoinBills) {
    const res = await client.query<{ status: string; c: string; cents: string }>(
      `
        SELECT wo.status::text AS status, COUNT(*)::text AS c,
               COALESCE(SUM(GREATEST(COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint), 0)), 0)::text AS cents
        FROM accounting.bills b
        JOIN maintenance.work_orders wo ON wo.id = b.linked_work_order_uuid
        WHERE b.operating_company_id = $1::uuid
          AND wo.operating_company_id = $1::uuid
          ${billsRevokedCol ? "AND b.revoked_at IS NULL" : ""}
        GROUP BY wo.status
      `,
      [operatingCompanyId]
    );
    for (const row of res.rows) {
      const bucket = bucketizeWoStatus(row.status);
      const count = Number(row.c ?? 0);
      const cents = Number(row.cents ?? 0);
      buckets[bucket].bill_count += count;
      buckets[bucket].bill_amount_cents += cents;
      totalBillCents += cents;
    }
  }

  if (canJoinExpenses) {
    const res = await client.query<{ status: string; c: string; cents: string }>(
      `
        SELECT wo.status::text AS status, COUNT(*)::text AS c,
               COALESCE(SUM(e.total_amount_cents), 0)::text AS cents
        FROM accounting.expenses e
        JOIN maintenance.work_orders wo ON wo.id = e.linked_work_order_uuid
        WHERE e.operating_company_id = $1::uuid
          AND wo.operating_company_id = $1::uuid
          ${expensesVoidedCol ? "AND e.voided_at IS NULL" : ""}
        GROUP BY wo.status
      `,
      [operatingCompanyId]
    );
    for (const row of res.rows) {
      const bucket = bucketizeWoStatus(row.status);
      const count = Number(row.c ?? 0);
      const cents = Number(row.cents ?? 0);
      buckets[bucket].expense_count += count;
      buckets[bucket].expense_amount_cents += cents;
      totalExpenseCents += cents;
    }
  }

  const existsClauses: string[] = [];
  if (canJoinBills) {
    existsClauses.push(
      `EXISTS (SELECT 1 FROM accounting.bills b WHERE b.linked_work_order_uuid = wo.id AND b.operating_company_id = wo.operating_company_id${billsRevokedCol ? " AND b.revoked_at IS NULL" : ""})`
    );
  }
  if (canJoinExpenses) {
    existsClauses.push(
      `EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.linked_work_order_uuid = wo.id${expensesVoidedCol ? " AND e.voided_at IS NULL" : ""})`
    );
  }
  const flowRes = await client.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
      FROM maintenance.work_orders wo
      WHERE wo.operating_company_id = $1::uuid
        AND wo.voided_at IS NULL
        AND (${existsClauses.join(" OR ")})
    `,
    [operatingCompanyId]
  );

  return {
    status: "ok",
    buckets,
    wo_with_expense_flow_count: Number(flowRes.rows[0]?.c ?? 0),
    total_linked_bill_amount_cents: totalBillCents,
    total_linked_expense_amount_cents: totalExpenseCents,
  };
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

const daysQuerySchema = companyQuerySchema.extend({
  days: z.coerce.number().int().min(1).max(120).default(7),
});

// h-05: optional range preset for the Home revenue KPI (default preserves today-only behavior).
const revenueRangeQuerySchema = companyQuerySchema.extend({
  range: z.enum(HOME_KPI_RANGES).default("today"),
});

export async function registerHomeWidgetRoutes(app: FastifyInstance) {
  app.get("/api/v1/home/weekly-revenue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = daysQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    // 0280-02: dual-basis invoice + GL linkage (no silent swallow → fabricated empty week).
    const { fromDate, toDate } = weeklyRevenueWindow(parsed.data.days);
    try {
      const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
        computeRevenueGlLinkage(client, {
          operatingCompanyId: parsed.data.operating_company_id,
          fromDate,
          toDate,
        })
      );
      // Typed 200 unverifiable — never conflate schema linkage gaps with transport/auth/5xx.
      if (result.status === "unverifiable") {
        return {
          ...revenuePayload(result),
          days: [],
          totalCents: null,
          error: "revenue_gl_linkage_unverifiable",
        };
      }
      return {
        ...revenuePayload(result),
        days: result.days.map((d) => ({
          date: d.date,
          cents: d.cents,
          invoice_basis_cents: d.invoice_basis_cents,
          gl_posted_revenue_cents: d.gl_posted_revenue_cents,
        })),
        totalCents: result.invoice_basis_cents,
      };
    } catch (err) {
      req.log.error({ err }, "home.weekly-revenue linkage failed");
      return reply.code(500).send({
        error: "revenue_gl_linkage_failed",
        message: err instanceof Error ? err.message : "unknown_error",
      });
    }
  });

  app.get("/api/v1/home/wo-status-counts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      // Canonical WO chart buckets — includes 'draft' so Samsara fault auto-WOs (status='draft')
      // are not silently dropped (HOME-4). 'unknown' captures any genuinely unmapped status.
      const out = { draft: 0, open: 0, in_progress: 0, awaiting_parts: 0, completed: 0, cancelled: 0, unknown: 0 };
      const rel = await client.query(`SELECT to_regclass('maintenance.work_orders') IS NOT NULL AS ok`);
      if (!rel.rows[0]?.ok) return out;

      // GO-0027-HOME-F: a genuine query failure here used to be caught and silently returned as
      // `out` (all zeros) — indistinguishable from "no open work orders" on the Home dashboard tile.
      // Never fabricate zeros on a query error — propagate so it surfaces as a 500, matching the
      // linked_economics handling right below and the fleet-utilization/*-revenue siblings in this file.
      try {
        const res = await client.query(
          `
            SELECT status::text AS status, COUNT(*)::text AS c
            FROM maintenance.work_orders
            WHERE operating_company_id = $1::uuid
              AND voided_at IS NULL
            GROUP BY status
          `,
          [parsed.data.operating_company_id]
        );
        for (const row of res.rows) {
          const bucket = bucketizeWoStatus(row.status);
          out[bucket] += Number(row.c ?? 0);
        }
      } catch (err) {
        req.log.error({ err, operating_company_id: parsed.data.operating_company_id }, "home.wo-status-counts query failed");
        throw err;
      }

      // ACCT-R-07 (0280-42-wo-to-expense-flow): join to accounting.bills/accounting.expenses via
      // the canonical linked_work_order_uuid FK — additive field, never breaks the pre-existing
      // { draft, open, ... } shape consumers already read. Never fabricate $0 on a query error —
      // surface it as `unverifiable` with a named reason instead of silently swallowing it.
      let linked_economics: WoLinkedEconomics;
      try {
        linked_economics = await computeWoLinkedEconomics(client, parsed.data.operating_company_id);
      } catch (err) {
        linked_economics = {
          status: "unverifiable",
          unverifiable_reason: err instanceof Error ? err.message : "wo_linked_economics_query_failed",
        };
      }
      return { ...out, linked_economics };
    });
  });

  app.get("/api/v1/home/fleet-utilization", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      try {
        const loadsOk = await client.query(`SELECT to_regclass('mdata.loads') IS NOT NULL AS ok`);
        const unitsOk = await client.query(`SELECT to_regclass('mdata.units') IS NOT NULL AS ok`);
        if (!loadsOk.rows[0]?.ok || !unitsOk.rows[0]?.ok) {
          return { active_units: 0, total_units: 0, percentage: 0 };
        }

        const totalRes = await client.query(
          `
            SELECT COUNT(*)::text AS c
            FROM mdata.units u
            WHERE u.deactivated_at IS NULL
              AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)
              AND ${excludeDemoPhantomSql("u.unit_number")}
              AND ${excludeSampleDataSql("u.is_sample_data")}
          `,
          [parsed.data.operating_company_id]
        );
        const activeRes = await client.query(
          `
            SELECT COUNT(DISTINCT assigned_unit_id)::text AS c
            FROM mdata.loads
            WHERE operating_company_id = $1::uuid
              AND assigned_unit_id IS NOT NULL
              AND status::text IN ('dispatched','in_transit','delivered_pending_docs','assigned_not_dispatched')
              AND is_sample_data IS NOT TRUE
          `,
          [parsed.data.operating_company_id]
        );

        const totalUnits = Number(totalRes.rows[0]?.c ?? 0);
        const activeUnits = Number(activeRes.rows[0]?.c ?? 0);
        const utilizationPct = totalUnits > 0 ? Math.round((activeUnits / totalUnits) * 1000) / 10 : 0;
        // snake_case to match the frontend gauge (api/home.ts fetchHomeFleetUtilization).
        return { active_units: activeUnits, total_units: totalUnits, percentage: utilizationPct };
      } catch (error) {
        req.log.error({ err: error, operating_company_id: parsed.data.operating_company_id }, "fleet utilization query failed");
        throw error;
      }
    });
  });

  app.get("/api/v1/home/today-revenue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = revenueRangeQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    // 0280-02: dual-basis invoice + GL linkage (company TZ; no silent swallow → fabricated $0).
    // h-05: ?range=today|7d|30d|mtd|ytd — default "today" keeps todayRevenueWindow() semantics.
    const { fromDate, toDate } =
      parsed.data.range === "today" ? todayRevenueWindow() : revenueRangeWindow(parsed.data.range);
    try {
      const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
        computeRevenueGlLinkage(client, {
          operatingCompanyId: parsed.data.operating_company_id,
          fromDate,
          toDate,
        })
      );
      // Typed 200 unverifiable — never conflate schema linkage gaps with transport/auth/5xx.
      if (result.status === "unverifiable") {
        return {
          ...revenuePayload(result),
          error: "revenue_gl_linkage_unverifiable",
        };
      }
      return revenuePayload(result);
    } catch (err) {
      req.log.error({ err }, "home.today-revenue linkage failed");
      return reply.code(500).send({
        error: "revenue_gl_linkage_failed",
        message: err instanceof Error ? err.message : "unknown_error",
      });
    }
  });

  app.get("/api/v1/home/open-loads-count", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const rel = await client.query(`SELECT to_regclass('mdata.loads') IS NOT NULL AS ok`);
      if (!rel.rows[0]?.ok) return { total: 0, in_transit: 0, assigned: 0, unassigned: 0 };
      // GO-0027-HOME-F: never fabricate zeros on a genuine query error — propagate as a 500.
      try {
        // Rich breakdown (total + mutually-exclusive sub-buckets) for the Home OPEN LOADS tile.
        return await getOpenLoadsBreakdown(client, parsed.data.operating_company_id);
      } catch (err) {
        req.log.error({ err, operating_company_id: parsed.data.operating_company_id }, "home.open-loads-count query failed");
        throw err;
      }
    });
  });

  app.get("/api/v1/home/drivers-on-duty", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const rel = await client.query(`SELECT to_regclass('mdata.loads') IS NOT NULL AS ok`);
      if (!rel.rows[0]?.ok) return { active: 0, total_drivers: 0, on_break: 0 };
      // GO-0027-HOME-F: never fabricate zeros on a genuine query error — propagate as a 500.
      try {
        // Numerator = drivers on a canonical active load. Denominator = active driver roster
        // (HOME-3: the "/0" was wrong — there is no roster query feeding the denominator).
        const active = await countDriversOnActiveLoads(client, parsed.data.operating_company_id);
        const rosterRes = await client.query(
          `
            SELECT count(*)::text AS c
            FROM mdata.drivers d
            WHERE (
                d.operating_company_id = $1::uuid
                OR EXISTS (
                  SELECT 1 FROM mdata.driver_company_authorizations home_duty_roster_dca
                  WHERE home_duty_roster_dca.driver_id = d.id
                    AND home_duty_roster_dca.company_id = $1::uuid
                    AND home_duty_roster_dca.is_authorized = true
                    AND home_duty_roster_dca.deactivated_at IS NULL
                )
              )
              AND d.deactivated_at IS NULL
              AND d.is_sample_data = false
          `,
          [parsed.data.operating_company_id]
        );
        const total_drivers = Number(rosterRes.rows[0]?.c ?? 0);
        // on_break is not yet wired to live HOS duty-status; report 0 honestly rather than fake it.
        return { active, total_drivers, on_break: 0 };
      } catch (err) {
        req.log.error({ err, operating_company_id: parsed.data.operating_company_id }, "home.drivers-on-duty query failed");
        throw err;
      }
    });
  });

  app.get("/api/v1/home/wos-open-count", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const rel = await client.query(`SELECT to_regclass('maintenance.work_orders') IS NOT NULL AS ok`);
      if (!rel.rows[0]?.ok) return { open: 0, in_progress: 0 };
      // open = canonical open set (matches the Maintenance dashboard open_wos); in_progress = subset.
      // Returns { open, in_progress } to match the Home tile (api/home.ts fetchHomeWosOpenCount).
      //
      // MAINT-VOID: this claimed to match the maintenance dashboard but re-typed the status list and
      // omitted the void filter, so VOIDED work orders were counted. On prod that made Home report
      // "2 open work orders" when both rows were voided demo records (DEMO-WO-001/002, voided
      // 2026-07-13) and the maintenance table itself correctly showed "0 of 0". Now it uses the ONE
      // canonical predicate so the two can never disagree again.
      //
      // GO-0027-HOME-F: never fabricate zeros on a genuine query error — propagate as a 500.
      try {
        const res = await client.query(
          `
            SELECT
              count(*) FILTER (WHERE ${openWorkOrderPredicate()})::text AS open,
              count(*) FILTER (WHERE status = 'in_progress' AND voided_at IS NULL)::text AS in_progress
            FROM maintenance.work_orders
            WHERE operating_company_id = $1::uuid
          `,
          [parsed.data.operating_company_id]
        );
        return {
          open: Number(res.rows[0]?.open ?? 0),
          in_progress: Number(res.rows[0]?.in_progress ?? 0),
        };
      } catch (err) {
        req.log.error({ err, operating_company_id: parsed.data.operating_company_id }, "home.wos-open-count query failed");
        throw err;
      }
    });
  });

  app.get("/api/v1/home/cash-position", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const rel = await client.query(`SELECT to_regclass('banking.bank_accounts') IS NOT NULL AS ok`);
      if (!rel.rows[0]?.ok) return { totalCents: 0, byAccount: [] as Array<{ accountName: string; cents: number }> };

      // GO-0027-HOME-F: never fabricate zeros on a genuine query error — propagate as a 500.
      try {
        // BANK-ACCOUNT-HIDE: exclude accounts hidden for THIS entity (flag OFF by default — see
        // docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
        const hideOn = await isBankAccountHideEnabled(client, parsed.data.operating_company_id);
        const res = await client.query(
          `
            SELECT COALESCE(NULLIF(trim(account_name), ''), 'Account') AS name,
                   COALESCE(current_balance_cents, 0)::text AS cents
            FROM banking.bank_accounts
            WHERE operating_company_id = $1::uuid
              AND deactivated_at IS NULL
              AND is_active = true
              AND account_class = 'depository'
              ${bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts")}
          `,
          [parsed.data.operating_company_id]
        );

        const byAccount = res.rows.map((r: { name?: unknown; cents?: unknown }) => ({
          accountName: String(r.name ?? "Account"),
          cents: Number(r.cents ?? 0),
        }));
        const totalCents = byAccount.reduce((sum: number, row: { cents: number }) => sum + row.cents, 0);
        return { totalCents, byAccount };
      } catch (err) {
        req.log.error({ err, operating_company_id: parsed.data.operating_company_id }, "home.cash-position query failed");
        throw err;
      }
    });
  });

  app.get("/api/v1/home/factoring-balance", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    // 0280-05: invoice-grain Faro liability + separate reserve receivable.
    // Never read superseded views.factoring_summary (0124 dead companies.current_reserve_balance).
    // Never silent catch → fabricated $0.
    try {
      const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
        computeFactoringBalanceInvoiceLinkage(client, {
          operatingCompanyId: parsed.data.operating_company_id,
        })
      );
      if (result.status === "unverifiable" || result.status === "accounting_exception") {
        return {
          ...factoringBalancePayload(result),
          error:
            result.status === "accounting_exception"
              ? "factoring_balance_invoice_linkage_accounting_exception"
              : "factoring_balance_invoice_linkage_unverifiable",
        };
      }
      return factoringBalancePayload(result);
    } catch (err) {
      req.log.error({ err }, "home.factoring-balance invoice linkage failed");
      return reply.code(500).send({
        error: "factoring_balance_invoice_linkage_failed",
        message: err instanceof Error ? err.message : "unknown_error",
      });
    }
  });

  // Auth probe for tests
  app.get("/api/v1/home/widgets-auth-check", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    return { ok: true };
  });
}
