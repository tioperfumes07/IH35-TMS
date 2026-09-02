// GO-20 slice C (docs/lockdown/GO-20-EIGHT-FEATURES.txt) — INTERFACE:
//   GET  /api/v1/safety/accident-liabilities
//   POST /api/v1/safety/accident-liabilities/:id/decide   owner role only
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  AccidentLiabilityError,
  decideAccidentLiability,
  voidAccidentLiability,
  type DbClient,
} from "./accident-liabilities.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  // Default true — the whole point of this surface is the owner's "awaiting your decision" queue.
  // awaiting_decision=false lists everything (decided/posted/closed included).
  awaiting_decision: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const decideBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  decision: z.enum(["driver_chargeback", "company_absorbs", "insurance_only", "split"]),
  note: z.string().trim().min(1, "A note is required for every owner decision."),
  driver_charge_cents: z.number().int().min(0).optional(),
  company_absorb_cents: z.number().int().min(0).optional(),
});

const voidBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(1),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function mapAccidentLiabilityHttpError(error: unknown) {
  if (error instanceof AccidentLiabilityError) {
    if (error.code === "accident_liability_not_found") return { statusCode: 404 as const, body: { error: error.code } };
    return { statusCode: 409 as const, body: { error: error.code, message: error.message } };
  }
  return null;
}

export async function registerAccidentLiabilitiesRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/accident-liabilities", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters = ["al.operating_company_id = $1::uuid", "al.voided_at IS NULL"];
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.awaiting_decision) {
        filters.push("al.owner_decision IS NULL");
      }
      const countRes = await client.query<{ total_count: string }>(
        `SELECT COUNT(*)::text AS total_count FROM safety.accident_liabilities al WHERE ${filters.join(" AND ")}`,
        values
      );
      const rangeValues = [...values, query.data.limit, query.data.offset];
      const limitParam = rangeValues.length - 1;
      const offsetParam = rangeValues.length;
      const rowsRes = await client.query(
        `
          SELECT al.*,
                 ar.display_id AS accident_display_id,
                 NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name,
                 u.unit_number AS unit_number,
                 l.load_number AS load_number
            FROM safety.accident_liabilities al
            LEFT JOIN safety.accident_reports ar ON ar.id = al.accident_id
            LEFT JOIN mdata.drivers d ON d.id = al.driver_id
            LEFT JOIN mdata.units u ON u.id = al.unit_id
            LEFT JOIN mdata.loads l ON l.id = al.load_id
           WHERE ${filters.join(" AND ")}
           ORDER BY al.created_at DESC
           LIMIT $${limitParam} OFFSET $${offsetParam}
        `,
        rangeValues
      );
      return { rows: rowsRes.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return payload;
  });

  app.post(
    "/api/v1/safety/accident-liabilities/:id/decide",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = decideBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      // Owner role only — "The owner decides. Only the owner." Not Admin, not Safety: this is the
      // decision that moves a driver's pay and the company's books.
      if (user.role !== "Owner") {
        return reply.code(403).send({ error: "accident_liability_decide_restricted" });
      }

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          decideAccidentLiability(client, {
            operating_company_id: body.data.operating_company_id,
            liability_id: params.data.id,
            decision: body.data.decision,
            note: body.data.note,
            decided_by_user_id: user.uuid,
            driver_charge_cents: body.data.driver_charge_cents,
            company_absorb_cents: body.data.company_absorb_cents,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapAccidentLiabilityHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );

  app.post(
    "/api/v1/safety/accident-liabilities/:id/void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = voidBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      if (user.role !== "Owner") {
        return reply.code(403).send({ error: "accident_liability_void_restricted" });
      }

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          voidAccidentLiability(client, {
            operating_company_id: body.data.operating_company_id,
            liability_id: params.data.id,
            voided_by_user_id: user.uuid,
            reason: body.data.reason,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapAccidentLiabilityHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );
}
