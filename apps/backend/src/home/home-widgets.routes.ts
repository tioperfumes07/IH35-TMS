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
  type RevenueGlLinkageResult,
} from "./revenue-gl-linkage.service.js";

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

function officeRole(role: string) {
  return role !== "Driver";
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

const daysQuerySchema = companyQuerySchema.extend({
  days: z.coerce.number().int().min(1).max(120).default(7),
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
      try {
        const rel = await client.query(`SELECT to_regclass('maintenance.work_orders') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return out;

        const res = await client.query(
          `
            SELECT status::text AS status, COUNT(*)::text AS c
            FROM maintenance.work_orders
            WHERE operating_company_id = $1::uuid
            GROUP BY status
          `,
          [parsed.data.operating_company_id]
        );
        for (const row of res.rows) {
          const k = String(row.status ?? "").toLowerCase();
          const n = Number(row.c ?? 0);
          if (k === "draft") out.draft += n;
          else if (k === "open") out.open += n;
          else if (k.includes("progress")) out.in_progress += n;
          else if (k.includes("await") || k.includes("parts")) out.awaiting_parts += n;
          else if (k.includes("complete")) out.completed += n;
          else if (k.includes("cancel")) out.cancelled += n;
          else out.unknown += n;
        }
        return out;
      } catch {
        return out;
      }
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
          `,
          [parsed.data.operating_company_id]
        );

        const totalUnits = Number(totalRes.rows[0]?.c ?? 0);
        const activeUnits = Number(activeRes.rows[0]?.c ?? 0);
        const utilizationPct = totalUnits > 0 ? Math.round((activeUnits / totalUnits) * 1000) / 10 : 0;
        // snake_case to match the frontend gauge (api/home.ts fetchHomeFleetUtilization).
        return { active_units: activeUnits, total_units: totalUnits, percentage: utilizationPct };
      } catch {
        return { active_units: 0, total_units: 0, percentage: 0 };
      }
    });
  });

  app.get("/api/v1/home/today-revenue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    // 0280-02: dual-basis invoice + GL linkage (company TZ; no silent swallow → fabricated $0).
    const { fromDate, toDate } = todayRevenueWindow();
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
      try {
        const rel = await client.query(`SELECT to_regclass('mdata.loads') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return { total: 0, in_transit: 0, assigned: 0, unassigned: 0 };
        // Rich breakdown (total + mutually-exclusive sub-buckets) for the Home OPEN LOADS tile.
        return await getOpenLoadsBreakdown(client, parsed.data.operating_company_id);
      } catch {
        return { total: 0, in_transit: 0, assigned: 0, unassigned: 0 };
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
      try {
        const rel = await client.query(`SELECT to_regclass('mdata.loads') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return { active: 0, total_drivers: 0, on_break: 0 };
        // Numerator = drivers on a canonical active load. Denominator = active driver roster
        // (HOME-3: the "/0" was wrong — there is no roster query feeding the denominator).
        const active = await countDriversOnActiveLoads(client, parsed.data.operating_company_id);
        const rosterRes = await client.query(
          `
            SELECT count(*)::text AS c
            FROM mdata.drivers
            WHERE operating_company_id = $1::uuid
              AND deactivated_at IS NULL
              AND is_sample_data = false
          `,
          [parsed.data.operating_company_id]
        );
        const total_drivers = Number(rosterRes.rows[0]?.c ?? 0);
        // on_break is not yet wired to live HOS duty-status; report 0 honestly rather than fake it.
        return { active, total_drivers, on_break: 0 };
      } catch {
        return { active: 0, total_drivers: 0, on_break: 0 };
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
      try {
        const rel = await client.query(`SELECT to_regclass('maintenance.work_orders') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return { open: 0, in_progress: 0 };
        // open = canonical open set (matches the Maintenance dashboard open_wos); in_progress = subset.
        // Returns { open, in_progress } to match the Home tile (api/home.ts fetchHomeWosOpenCount).
        const res = await client.query(
          `
            SELECT
              count(*) FILTER (WHERE status IN ('open','in_progress','waiting_parts'))::text AS open,
              count(*) FILTER (WHERE status = 'in_progress')::text AS in_progress
            FROM maintenance.work_orders
            WHERE operating_company_id = $1::uuid
          `,
          [parsed.data.operating_company_id]
        );
        return {
          open: Number(res.rows[0]?.open ?? 0),
          in_progress: Number(res.rows[0]?.in_progress ?? 0),
        };
      } catch {
        return { open: 0, in_progress: 0 };
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
      try {
        const rel = await client.query(`SELECT to_regclass('banking.bank_accounts') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return { totalCents: 0, byAccount: [] as Array<{ accountName: string; cents: number }> };

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
      } catch {
        return { totalCents: 0, byAccount: [] };
      }
    });
  });

  app.get("/api/v1/home/factoring-balance", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      try {
        // FACTOR-1: read the reserve balance from the real, populated source.
        // The old read hit a factoring balances table/columns that no migration ever
        // creates or writes, so the tile was always $0.
        // views.factoring_summary is the canonical, security_invoker rollup over
        // accounting.factoring_advances (the invoice-linked factoring workflow, written by
        // accounting/factoring-advances.routes.ts). reserve_balance is the reserve still held
        // by the factor (money the carrier is owed — ASC 860 short-term asset); both columns are
        // in CENTS (SUM of *_cents source columns). Same source used by /factoring/summary and
        // reports/cash-flow-overview.
        const res = await client.query(
          `
            SELECT
              COALESCE(reserve_balance, 0)::text AS reserve,
              COALESCE(mtd_advanced_total, 0)::text AS advanced
            FROM views.factoring_summary
            WHERE operating_company_id = $1::uuid
            LIMIT 1
          `,
          [parsed.data.operating_company_id]
        );
        const reserveCents = Number(res.rows[0]?.reserve ?? 0);
        const advancedCents = Number(res.rows[0]?.advanced ?? 0);
        return { reserveCents, advancedCents, totalCents: reserveCents + advancedCents };
      } catch {
        return { reserveCents: 0, advancedCents: 0, totalCents: 0 };
      }
    });
  });

  // Auth probe for tests
  app.get("/api/v1/home/widgets-auth-check", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    return { ok: true };
  });
}
