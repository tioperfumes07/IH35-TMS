import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

/**
 * Linkage law §6 for Relay fills (integrations.relay_fuel_transactions). Relay rows never become
 * fuel.fuel_transactions (ROUND 43 owner ruling cut that bridge after it duplicated Dreamline), so
 * without this read a Relay fill was reachable from NO hub: the truck page, the driver page and the
 * unmatched worklist all list them here. Read-only.
 */
const query = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  /** The risk window: fills Relay sent that no truck or driver has been matched to yet. */
  unmatched: z.enum(["true", "false"]).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerRelayFillRoutes(app: FastifyInstance) {
  app.get("/api/v1/fuel/relay-fills", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = query.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const d = q.data;
    await assertCompanyMembership(user.uuid, d.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [d.operating_company_id]);
      const values: unknown[] = [d.operating_company_id];
      const where = ["r.operating_company_id = $1::uuid", "r.voided_at IS NULL"];
      if (d.unit_id) {
        values.push(d.unit_id);
        where.push(`r.matched_unit_id = $${values.length}::uuid`);
      }
      if (d.driver_id) {
        values.push(d.driver_id);
        where.push(`r.matched_driver_id = $${values.length}::uuid`);
      }
      if (d.unmatched === "true") where.push("(r.matched_unit_id IS NULL OR r.matched_driver_id IS NULL)");
      if (d.from) {
        values.push(d.from);
        where.push(`r.relay_created_at >= $${values.length}::date`);
      }
      if (d.to) {
        values.push(d.to);
        where.push(`r.relay_created_at < ($${values.length}::date + 1)`);
      }
      const total = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM integrations.relay_fuel_transactions r WHERE ${where.join(" AND ")}`,
        values
      );
      values.push(d.limit, d.offset);
      const rows = await client.query(
        `SELECT r.id::text, r.transaction_id, r.relay_created_at::text, r.merchant_name, r.location_name,
                r.location_city, r.location_state, r.location_latitude::float8 AS lat, r.location_longitude::float8 AS lng,
                r.total_amount_paid_cents::bigint AS total_amount_paid_cents,
                -- OWNER LAW 2026-10-02: derived from a journal entry existing, never the hand-set staging flag. A fill
                -- is booked when its card bank line is matched in Banking and that match carries a journal entry.
                EXISTS (SELECT 1 FROM banking.bank_transactions bt
                         WHERE bt.matched_relay_fuel_transaction_id = r.id AND bt.operating_company_id = r.operating_company_id
                           AND bt.voided_at IS NULL AND bt.matched_journal_entry_id IS NOT NULL) AS posted_to_gl,
                r.matched_unit_id::text AS unit_id, u.unit_number,
                r.matched_driver_id::text AS driver_id,
                NULLIF(trim(concat_ws(' ', dr.first_name, dr.last_name)), '') AS driver_name,
                NULLIF(trim(concat_ws(' ', r.relay_driver_first_name, r.relay_driver_last_name)), '') AS relay_driver_name,
                r.matched_unit_number AS relay_unit_number,
                (SELECT sum(l.volume)::float8 FROM integrations.relay_fuel_transaction_lines l
                  WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL AND l.volume_uom = 'gallons'
                    AND l.fuel_type IN ('diesel', 'reefer')) AS fuel_gallons,
                (SELECT sum(l.volume)::float8 FROM integrations.relay_fuel_transaction_lines l
                  WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL AND l.volume_uom = 'gallons'
                    AND l.fuel_type = 'def') AS def_gallons
           FROM integrations.relay_fuel_transactions r
           LEFT JOIN mdata.units u ON u.id = r.matched_unit_id
           LEFT JOIN mdata.drivers dr ON dr.id = r.matched_driver_id AND dr.operating_company_id = r.operating_company_id
          WHERE ${where.join(" AND ")}
          ORDER BY r.relay_created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return { rows: rows.rows, total_count: total.rows[0]?.n ?? 0, has_more: d.offset + d.limit < (total.rows[0]?.n ?? 0) };
    });
  });
}
