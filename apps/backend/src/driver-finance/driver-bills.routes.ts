import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { canAccessDriverLoadBills } from "./driver-bills-access.js";

const querySchema = companyQuerySchema.extend({
  load_id: z.string().uuid(),
});

export async function registerDriverFinanceDriverBillsRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-finance/driver-bills", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const reg = await client.query(`SELECT to_regclass('driver_finance.driver_bills') IS NOT NULL AS ok`);
      if (!Boolean(reg.rows[0]?.ok)) return { kind: "unavailable" as const };

      const loadRes = await client.query(
        `
          SELECT
            l.id,
            l.load_number,
            d1.identity_user_id AS primary_identity_user_id,
            d2.identity_user_id AS secondary_identity_user_id
          FROM mdata.loads l
          LEFT JOIN mdata.drivers d1 ON d1.id = l.assigned_primary_driver_id
          LEFT JOIN mdata.drivers d2 ON d2.id = l.assigned_secondary_driver_id
          WHERE l.id = $1
            AND l.operating_company_id = $2
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [parsed.data.load_id, parsed.data.operating_company_id]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return { kind: "not_found" as const };

      if (
        !canAccessDriverLoadBills(
          String(user.role ?? ""),
          user.uuid,
          load.primary_identity_user_id,
          load.secondary_identity_user_id
        )
      ) {
        return { kind: "forbidden" as const };
      }

      const billsRes = await client.query(
        `
          SELECT *
          FROM driver_finance.driver_bills
          WHERE operating_company_id = $1
            AND load_id = $2
          ORDER BY created_at ASC
        `,
        [parsed.data.operating_company_id, parsed.data.load_id]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.driver_bills.viewed",
        {
          operating_company_id: parsed.data.operating_company_id,
          load_id: parsed.data.load_id,
          load_number: load.load_number ?? null,
          bill_count: billsRes.rows.length,
        },
        "info",
        "P6-T11172"
      );

      return { kind: "ok" as const, bills: billsRes.rows };
    });

    if (!payload) return reply.code(500).send({ error: "driver_bills_failed" });
    if (payload.kind === "unavailable") return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (payload.kind === "not_found") return reply.code(404).send({ error: "load_not_found" });
    if (payload.kind === "forbidden") return reply.code(403).send({ error: "forbidden" });

    return { driver_bills: payload.bills };
  });
}
