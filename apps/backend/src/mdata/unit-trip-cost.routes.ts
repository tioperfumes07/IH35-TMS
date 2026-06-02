import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { buildUnitAggregate } from "./unit-aggregate.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ id: z.string().uuid() });

const tripCostBodySchema = z
  .object({
    destination_zip: z.string().trim().min(3).max(20).optional(),
    destination_coords: z.object({ lat: z.number(), lng: z.number() }).optional(),
    miles_optional: z.number().positive().optional(),
  })
  .refine((v) => v.destination_zip || v.destination_coords || v.miles_optional, {
    message: "destination_zip, destination_coords, or miles_optional required",
  });

const DEFAULT_MPG = 6.5;
const DEFAULT_DIESEL_USD_PER_GAL = 3.85;
const MAINTENANCE_USD_PER_MILE = 0.15;
const DEFAULT_CPM_CENTS = 55;

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function registerUnitTripCostRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/units/:id/trip-cost", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = tripCostBodySchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const aggregate = await buildUnitAggregate(client, params.data.id, query.data.operating_company_id);
      if (!aggregate) return null;

      const pos = aggregate.latest_position as { lat?: number; lng?: number } | null;
      let estimated_miles = body.data.miles_optional ?? null;
      const assumptions: string[] = [];

      if (estimated_miles == null && body.data.destination_coords && pos?.lat != null && pos?.lng != null) {
        const straight = haversineMiles(Number(pos.lat), Number(pos.lng), body.data.destination_coords.lat, body.data.destination_coords.lng);
        estimated_miles = Math.round(straight * 1.2);
        assumptions.push("Distance = straight-line × 1.2 road fudge");
      } else if (estimated_miles == null && body.data.destination_zip) {
        estimated_miles = 450;
        assumptions.push("V1 zip geocode unavailable — used 450 mi placeholder");
      } else if (estimated_miles != null) {
        assumptions.push("Used client-supplied miles");
      } else {
        estimated_miles = 300;
        assumptions.push("Default 300 mi — no origin/destination geometry");
      }

      const samsaraParsed = (aggregate.samsara as { raw_payload_parsed?: { odometer_miles?: number } } | null)?.raw_payload_parsed;
      const mpg = DEFAULT_MPG;
      assumptions.push(`MPG assumption: ${mpg} (fleet default)`);

      const diesel = DEFAULT_DIESEL_USD_PER_GAL;
      const estimated_fuel_cost_cents = Math.round((estimated_miles / mpg) * diesel * 100);
      const cpm = DEFAULT_CPM_CENTS;
      const estimated_driver_pay_cents = Math.round(estimated_miles * cpm);
      assumptions.push(`Driver pay: ${cpm}¢/mi fleet default`);
      const estimated_maintenance_accrual_cents = Math.round(estimated_miles * MAINTENANCE_USD_PER_MILE * 100);
      const total_estimated_cost_cents =
        estimated_fuel_cost_cents + estimated_driver_pay_cents + estimated_maintenance_accrual_cents;
      const suggested_quote_floor_cents = Math.round(total_estimated_cost_cents * 1.15);

      return {
        estimated_fuel_cost_cents,
        estimated_driver_pay_cents,
        estimated_maintenance_accrual_cents,
        estimated_tolls_cents: null,
        total_estimated_cost_cents,
        suggested_quote_floor_cents,
        estimated_miles,
        assumptions,
        odometer_miles: samsaraParsed?.odometer_miles ?? null,
      };
    });

    if (!result) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return result;
  });
}
