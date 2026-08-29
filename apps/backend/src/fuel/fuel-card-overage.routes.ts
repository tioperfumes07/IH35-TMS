/**
 * BANK-F10 / FUEL-03 — approve-then-recover HTTP surface.
 *
 * ROOT CAUSE: maybeEvaluateFuelCardOverage + approveAndPostFuelCardOverage existed but had no mounted
 * routes — operators could not list pending overage events or approve recovery (DOD-A gap).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  approveAndPostFuelCardOverage,
  reprocessUnprocessedFuelOverages,
} from "./fuel-card-overage.service.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z
    .enum(["pending_review", "approved", "posted", "company_variance", "all"])
    .default("pending_review"),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const approveParamsSchema = z.object({
  id: z.string().uuid(),
});

const approveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const APPROVE_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerFuelCardOverageRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/fuel/card-overage-events",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      const query = listQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const q = query.data;
      const result = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
        const tableExists = await client.query(
          `SELECT to_regclass('fuel.fuel_card_overage_events') IS NOT NULL AS ok`
        );
        if (!(tableExists.rows[0] as { ok?: boolean } | undefined)?.ok) {
          return { unavailable: true as const };
        }

        const values: unknown[] = [q.operating_company_id];
        const filters: string[] = [
          "e.operating_company_id = $1::uuid",
          "e.voided_at IS NULL",
        ];
        if (q.status !== "all") {
          values.push(q.status);
          filters.push(`e.status = $${values.length}`);
        }
        if (q.driver_id) {
          values.push(q.driver_id);
          filters.push(`e.driver_id = $${values.length}::uuid`);
        }
        if (q.unit_id) {
          values.push(q.unit_id);
          filters.push(`e.unit_id = $${values.length}::uuid`);
        }
        if (q.event_id) {
          values.push(q.event_id);
          filters.push(`e.id = $${values.length}::uuid`);
        }
        const whereClause = `WHERE ${filters.join(" AND ")}`;

        const countRes = await client.query(
          `SELECT count(*)::int AS total FROM fuel.fuel_card_overage_events e ${whereClause}`,
          values
        );

        values.push(q.limit);
        values.push(q.offset);
        const limitIdx = values.length - 1;
        const offsetIdx = values.length;

        const rowsRes = await client.query(
          `
            SELECT
              e.id,
              e.fuel_transaction_id,
              e.driver_id,
              e.unit_id,
              e.policy_id,
              e.overage_cents,
              e.total_cents,
              e.overage_rule,
              e.status,
              e.review_reason,
              e.has_contract_authority,
              e.journal_entry_id,
              e.approved_at,
              e.approved_by_user_id,
              e.created_at,
              ft.transaction_at,
              ft.fuel_type,
              ft.total_cost,
              NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), '') AS driver_name,
              u.unit_number
            FROM fuel.fuel_card_overage_events e
            JOIN fuel.fuel_transactions ft
              ON ft.id = e.fuel_transaction_id
             AND ft.operating_company_id = e.operating_company_id
            LEFT JOIN mdata.drivers d
              ON d.id = e.driver_id
             AND d.operating_company_id = e.operating_company_id
            LEFT JOIN mdata.units u ON u.id = e.unit_id
                                    AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ft.operating_company_id
            ${whereClause}
            ORDER BY e.created_at DESC
            LIMIT $${limitIdx}
            OFFSET $${offsetIdx}
          `,
          values
        );

        return {
          events: rowsRes.rows.map((row: Record<string, unknown>) => ({
            id: row.id,
            fuel_transaction_id: row.fuel_transaction_id,
            driver_id: row.driver_id,
            driver_name: (row.driver_name as string | null) ?? "Unassigned",
            unit_id: row.unit_id,
            unit_number: row.unit_number,
            policy_id: row.policy_id,
            overage_cents: Number(row.overage_cents ?? 0),
            total_cents: Number(row.total_cents ?? 0),
            overage_rule: row.overage_rule,
            status: row.status,
            review_reason: row.review_reason,
            has_contract_authority: row.has_contract_authority,
            journal_entry_id: row.journal_entry_id,
            approved_at: row.approved_at,
            approved_by_user_id: row.approved_by_user_id,
            created_at: row.created_at,
            transaction_at: row.transaction_at,
            fuel_type: row.fuel_type,
            total_cost: row.total_cost === null ? null : Number(row.total_cost),
          })),
          total: Number((countRes.rows[0] as { total?: number } | undefined)?.total ?? 0),
        };
      });

      if ("unavailable" in result) {
        return reply.code(501).send({ error: "fuel_card_overage_events_unavailable" });
      }
      return {
        events: result.events,
        total_count: result.total,
        has_more: q.offset + q.limit < result.total,
      };
    }
  );

  app.post(
    "/api/v1/fuel/card-overage-events/:id/approve",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!APPROVE_ROLES.has(String(authUser.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const params = approveParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = approveBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      await assertCompanyMembership(authUser.uuid, body.data.operating_company_id);

      const txnMeta = await withCompanyScope(authUser.uuid, body.data.operating_company_id, async (client) => {
        const tableExists = await client.query(
          `SELECT to_regclass('fuel.fuel_card_overage_events') IS NOT NULL AS ok`
        );
        if (!(tableExists.rows[0] as { ok?: boolean } | undefined)?.ok) return { unavailable: true as const };

        const res = await client.query(
          `
            SELECT ft.fuel_type, ft.transaction_at::text
              FROM fuel.fuel_card_overage_events e
              JOIN fuel.fuel_transactions ft
                ON ft.id = e.fuel_transaction_id
               AND ft.operating_company_id = e.operating_company_id
             WHERE e.id = $1::uuid
               AND e.operating_company_id = $2::uuid
               AND e.voided_at IS NULL
             LIMIT 1
          `,
          [params.data.id, body.data.operating_company_id]
        );
        const row = res.rows[0] as { fuel_type: string; transaction_at: string } | undefined;
        if (!row) return { not_found: true as const };
        return { fuel_type: row.fuel_type, transaction_at: row.transaction_at };
      });

      if ("unavailable" in txnMeta) {
        return reply.code(501).send({ error: "fuel_card_overage_events_unavailable" });
      }
      if ("not_found" in txnMeta) {
        return reply.code(404).send({ error: "overage_event_not_found" });
      }

      const outcome = await approveAndPostFuelCardOverage({
        operating_company_id: body.data.operating_company_id,
        overage_event_id: params.data.id,
        actor_user_id: authUser.uuid,
        actor_role: authUser.role,
        fuel_type: txnMeta.fuel_type,
        transaction_at: txnMeta.transaction_at,
      });

      if (outcome.status === "error") {
        const msg = outcome.message ?? "approve_failed";
        if (msg === "overage_event_not_found") return reply.code(404).send({ error: msg });
        if (msg.startsWith("invalid_status_for_approval")) {
          return reply.code(409).send({ error: msg });
        }
        if (msg === "contract_authority_required_before_driver_receivable") {
          return reply.code(422).send({ error: msg });
        }
        return reply.code(500).send({ error: "fuel_overage_approve_failed", message: msg });
      }

      return outcome;
    }
  );

  /** Owner/Admin backfill: re-evaluate fuel txns that have driver_id but no overage event yet. */
  app.post(
    "/api/v1/fuel/card-overage-events/reprocess",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!new Set(["Owner", "Administrator"]).has(String(authUser.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const body = approveBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      await assertCompanyMembership(authUser.uuid, body.data.operating_company_id);
      const stats = await reprocessUnprocessedFuelOverages(
        body.data.operating_company_id,
        authUser.uuid
      );
      return { ok: true, ...stats };
    }
  );
}
