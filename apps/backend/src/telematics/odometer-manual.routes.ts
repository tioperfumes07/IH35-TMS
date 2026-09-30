/**
 * ROUND 297.1 J-2 — manual odometer write path.
 *
 * source='manual', confidence='entered', recorded_by_user_id = caller -- never overwrites, and is
 * never overwritten by, a 'samsara'/'geofence'/'fuel_receipt'/'settlement' row (both CHECK
 * constraints on telematics.odometer_readings already permit every value this route writes;
 * verified live before writing this route).
 *
 * ROLLBACK GUARD: an odometer going backwards is a typo or a swapped ECU, not a real reading --
 * refused unless the caller explicitly passes allow_rollback=true with a reason, which is recorded
 * in the audit event for the override to be traceable.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  read_at: z.string().datetime({ offset: true }).optional(),
  odometer_miles: z.number().finite().nonnegative(),
  allow_rollback: z.boolean().default(false),
  rollback_reason: z.string().trim().min(1).max(500).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  companyId: string,
  fn: (client: DbClient) => Promise<T>
): Promise<T> {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client as DbClient);
  });
}

export async function registerOdometerManualRoutes(app: FastifyInstance) {
  app.post("/api/v1/telematics/odometer-readings", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const b = parsed.data;

    if (b.allow_rollback && !b.rollback_reason) {
      return reply.code(400).send({
        error: "validation_error",
        details: { allow_rollback: "rollback_reason is required when allow_rollback is true" },
      });
    }

    const result = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const last = await client.query<{ odometer_miles: string | null; read_at: string }>(
        `
          SELECT odometer_miles::text, read_at::text
          FROM telematics.odometer_readings
          WHERE operating_company_id = $1::uuid
            AND unit_id = $2::uuid
            AND odometer_miles IS NOT NULL
          ORDER BY read_at DESC
          LIMIT 1
        `,
        [b.operating_company_id, b.unit_id]
      );
      const lastMiles = last.rows[0]?.odometer_miles != null ? Number(last.rows[0].odometer_miles) : null;

      if (lastMiles != null && b.odometer_miles < lastMiles && !b.allow_rollback) {
        return {
          rejected: true as const,
          reason: `new reading ${b.odometer_miles} is below the last known odometer ${lastMiles} for this unit -- pass allow_rollback=true with a reason to override`,
          last_known_miles: lastMiles,
        };
      }

      const readAt = b.read_at ?? new Date().toISOString();
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO telematics.odometer_readings (
            operating_company_id, unit_id, read_at, odometer_miles, source, confidence, recorded_by_user_id
          )
          VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'manual', 'entered', $5::uuid)
          ON CONFLICT (operating_company_id, unit_id, telematics.odometer_reading_day(read_at), source)
            WHERE read_at >= '2026-09-30T00:00:00Z'::timestamptz
          DO UPDATE
          SET odometer_miles = EXCLUDED.odometer_miles,
              read_at = EXCLUDED.read_at,
              recorded_by_user_id = EXCLUDED.recorded_by_user_id,
              updated_at = now()
          RETURNING id::text
        `,
        [b.operating_company_id, b.unit_id, readAt, b.odometer_miles, user.uuid]
      );

      await appendCrudAudit(client, user.uuid, "telematics.odometer_reading.manual_entered", {
        operating_company_id: b.operating_company_id,
        unit_id: b.unit_id,
        odometer_miles: b.odometer_miles,
        read_at: readAt,
        rollback: b.allow_rollback,
        rollback_reason: b.rollback_reason ?? null,
        previous_known_miles: lastMiles,
      });

      return { rejected: false as const, id: inserted.rows[0]?.id ?? null, odometer_miles: b.odometer_miles, read_at: readAt };
    });

    if (result.rejected) return reply.code(409).send({ error: "odometer_rollback_refused", ...result });
    return reply.code(201).send(result);
  });
}
