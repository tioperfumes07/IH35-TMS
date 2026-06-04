import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  countActiveDispatchLoads,
  countDriversOnActiveLoads,
  countOpenMaintenanceWorkOrders,
} from "../kpi/canonical-kpis.js";

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

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      try {
        const rel = await client.query(`SELECT to_regclass('accounting.invoices') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return { days: [] as Array<{ date: string; cents: number }>, totalCents: 0 };

        const res = await client.query(
          `
            SELECT issue_date::text AS d,
                   COALESCE(SUM(total_cents), 0)::text AS cents
            FROM accounting.invoices
            WHERE operating_company_id = $1::uuid
              AND issue_date >= (CURRENT_DATE - ($2::int * interval '1 day'))
            GROUP BY issue_date
            ORDER BY issue_date ASC
          `,
          [parsed.data.operating_company_id, parsed.data.days]
        );
        const days = res.rows.map((r: { d?: unknown; cents?: unknown }) => ({
          date: String(r.d),
          cents: Number(r.cents ?? 0),
        }));
        const totalCents = days.reduce((sum: number, row: { cents: number }) => sum + row.cents, 0);
        return { days, totalCents };
      } catch {
        return { days: [], totalCents: 0 };
      }
    });

    return payload;
  });

  app.get("/api/v1/home/wo-status-counts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const out = { open: 0, in_progress: 0, awaiting_parts: 0, completed: 0, cancelled: 0 };
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
          if (k === "open") out.open += n;
          else if (k.includes("progress")) out.in_progress += n;
          else if (k.includes("await") || k.includes("parts")) out.awaiting_parts += n;
          else if (k.includes("complete")) out.completed += n;
          else if (k.includes("cancel")) out.cancelled += n;
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
          return { totalUnits: 0, activeUnits: 0, utilizationPct: 0 };
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
        return { totalUnits, activeUnits, utilizationPct };
      } catch {
        return { totalUnits: 0, activeUnits: 0, utilizationPct: 0 };
      }
    });
  });

  app.get("/api/v1/home/today-revenue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      try {
        const rel = await client.query(`SELECT to_regclass('accounting.invoices') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return { cents: 0 };

        const res = await client.query(
          `
            SELECT COALESCE(SUM(total_cents), 0)::text AS cents
            FROM accounting.invoices
            WHERE operating_company_id = $1::uuid
              AND issue_date = CURRENT_DATE
          `,
          [parsed.data.operating_company_id]
        );
        return { cents: Number(res.rows[0]?.cents ?? 0) };
      } catch {
        return { cents: 0 };
      }
    });
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
        if (!rel.rows[0]?.ok) return { count: 0 };
        const count = await countActiveDispatchLoads(client, parsed.data.operating_company_id);
        return { count };
      } catch {
        return { count: 0 };
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
        if (!rel.rows[0]?.ok) return { count: 0 };
        const count = await countDriversOnActiveLoads(client, parsed.data.operating_company_id);
        return { count };
      } catch {
        return { count: 0 };
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
        if (!rel.rows[0]?.ok) return { count: 0 };
        const count = await countOpenMaintenanceWorkOrders(client, parsed.data.operating_company_id);
        return { count };
      } catch {
        return { count: 0 };
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

        const res = await client.query(
          `
            SELECT COALESCE(NULLIF(trim(account_name), ''), 'Account') AS name,
                   COALESCE(current_balance_cents, 0)::text AS cents
            FROM banking.bank_accounts
            WHERE operating_company_id = $1::uuid
              AND deactivated_at IS NULL
              AND is_active = true
              AND account_class = 'depository'
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
        const rel = await client.query(`SELECT to_regclass('factoring.company_balances') IS NOT NULL AS ok`);
        if (!rel.rows[0]?.ok) return { reserveCents: 0, advancedCents: 0, totalCents: 0 };

        const res = await client.query(
          `
            SELECT
              COALESCE(SUM(reserve_cents), 0)::text AS reserve,
              COALESCE(SUM(advanced_cents), 0)::text AS advanced
            FROM factoring.company_balances
            WHERE operating_company_id = $1::uuid
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
