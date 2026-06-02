import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope, companyQuerySchema } from "../reports/shared.js";

const historyQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  direction: z.enum(["northbound", "southbound"]).optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function registerBorderCrossingHistoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/border-crossing/history", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = historyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["ubc.operating_company_id = $1::uuid", "ubc.wizard_completed_at IS NOT NULL"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (parsed.data.direction) {
        values.push(parsed.data.direction);
        filters.push(`ubc.direction = $${values.length}`);
      }
      values.push(parsed.data.limit, parsed.data.offset);

      const res = await client.query(
        `
          SELECT ubc.id::text, ubc.crossing_date, ubc.planned_crossing_date, ubc.direction,
                 ubc.port_of_entry, ubc.commodity, ubc.emanifest_reference, ubc.emanifest_status,
                 ubc.customs_broker_status, ubc.wizard_completed_at,
                 u.unit_number, d.first_name || ' ' || d.last_name AS driver_name,
                 l.load_number
          FROM mdata.unit_border_crossings ubc
          LEFT JOIN mdata.units u ON u.id = ubc.unit_id
          LEFT JOIN mdata.drivers d ON d.id = ubc.driver_id
          LEFT JOIN mdata.loads l ON l.id = ubc.load_id
          WHERE ${filters.join(" AND ")}
          ORDER BY ubc.wizard_completed_at DESC NULLS LAST, ubc.crossing_date DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return reply.send({ crossings: payload });
  });

  app.get("/api/v1/border-crossing/history/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT ubc.*,
                 u.unit_number,
                 d.first_name || ' ' || d.last_name AS driver_name,
                 l.load_number,
                 v.name AS customs_broker_name,
                 p.short_name AS port_short_name,
                 p.cbp_port_code
          FROM mdata.unit_border_crossings ubc
          LEFT JOIN mdata.units u ON u.id = ubc.unit_id
          LEFT JOIN mdata.drivers d ON d.id = ubc.driver_id
          LEFT JOIN mdata.loads l ON l.id = ubc.load_id
          LEFT JOIN mdata.vendors v ON v.id = ubc.customs_broker_id
          LEFT JOIN reference.ports_of_entry p ON p.id = ubc.port_of_entry_id
          WHERE ubc.id = $1::uuid
            AND ubc.operating_company_id = $2::uuid
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0];
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send({ crossing: row });
  });
}
