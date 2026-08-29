import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const historyQuerySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    unit_id: z.string().uuid().optional(),
    driver_id: z.string().uuid().optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((value) => Boolean(value.unit_id) || Boolean(value.driver_id), {
    message: "unit_id or driver_id is required",
  });

const lookupQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  ts: z.string().min(1),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerVehicleDriverPairingRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/vehicle-driver-history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = historyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const days = parsed.data.days ?? 30;
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);

      const filters: string[] = ["a.operating_company_id = $1::uuid", "a.started_at >= now() - ($2::int || ' days')::interval"];
      const params: unknown[] = [parsed.data.operating_company_id, days];
      if (parsed.data.unit_id) {
        params.push(parsed.data.unit_id);
        filters.push(`a.unit_id = $${params.length}::uuid`);
      }
      if (parsed.data.driver_id) {
        params.push(parsed.data.driver_id);
        filters.push(`a.driver_id = $${params.length}::uuid`);
      }

      params.push(parsed.data.limit, parsed.data.offset);
      const limitParam = params.length - 1;
      const offsetParam = params.length;

      const res = await client.query<{
        id: string;
        unit_id: string;
        unit_number: string;
        driver_id: string | null;
        driver_name: string | null;
        started_at: string;
        ended_at: string | null;
        source: string;
        total_count: number;
      }>(
        `
          SELECT
            a.id::text,
            a.unit_id::text,
            u.unit_number,
            a.driver_id::text,
            CASE
              WHEN d.id IS NULL THEN NULL
              ELSE trim(concat(coalesce(d.first_name, ''), ' ', coalesce(d.last_name, '')))
            END AS driver_name,
            a.started_at::text,
            a.ended_at::text,
            a.source,
            COUNT(*) OVER()::int AS total_count
          FROM telematics.vehicle_driver_assignments a
          JOIN mdata.units u ON u.id = a.unit_id
                            AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
          LEFT JOIN mdata.drivers d ON d.id = a.driver_id
                                    AND (
                                      d.operating_company_id = $1::uuid
                                      OR EXISTS (
                                        SELECT 1
                                        FROM mdata.driver_company_authorizations pairing_history_dca
                                        WHERE pairing_history_dca.driver_id = d.id
                                          AND pairing_history_dca.company_id = $1::uuid
                                          AND pairing_history_dca.is_authorized = true
                                          AND pairing_history_dca.deactivated_at IS NULL
                                      )
                                    )
          WHERE ${filters.join(" AND ")}
          ORDER BY a.started_at DESC, a.created_at DESC
          LIMIT $${limitParam} OFFSET $${offsetParam}
        `,
        params
      );
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0) };
    });

    return { rows: rows.rows, total_count: rows.total_count, limit: parsed.data.limit, offset: parsed.data.offset };
  });

  app.get("/api/v1/telematics/vehicle-driver-lookup", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = lookupQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      const res = await client.query<{ driver_id: string | null }>(
        `
          SELECT a.driver_id::text
          FROM telematics.vehicle_driver_assignments a
          WHERE a.operating_company_id = $1::uuid
            AND a.unit_id = $2::uuid
            AND a.started_at <= $3::timestamptz
            AND (a.ended_at IS NULL OR a.ended_at > $3::timestamptz)
          ORDER BY a.started_at DESC, a.created_at DESC
          LIMIT 1
        `,
        [parsed.data.operating_company_id, parsed.data.unit_id, parsed.data.ts]
      );
      return { driver_id: res.rows[0]?.driver_id ?? null };
    });

    return payload;
  });
}
