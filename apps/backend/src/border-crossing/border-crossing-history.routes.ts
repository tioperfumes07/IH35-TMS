import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope, companyQuerySchema } from "../reports/shared.js";

const historyQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  direction: z.enum(["northbound", "southbound"]).optional(),
  unit_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  customs_broker_id: z.string().uuid().optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function registerBorderCrossingHistoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/border-crossing/history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      if (parsed.data.unit_id) {
        values.push(parsed.data.unit_id);
        filters.push(`ubc.unit_id = $${values.length}::uuid`);
      }
      if (parsed.data.driver_id) {
        values.push(parsed.data.driver_id);
        filters.push(`ubc.driver_id = $${values.length}::uuid`);
      }
      if (parsed.data.load_id) {
        values.push(parsed.data.load_id);
        filters.push(`ubc.load_id = $${values.length}::uuid`);
      }
      if (parsed.data.customs_broker_id) {
        values.push(parsed.data.customs_broker_id);
        filters.push(`ubc.customs_broker_id = $${values.length}::uuid`);
      }
      values.push(parsed.data.limit, parsed.data.offset);

      const res = await client.query(
        `
          SELECT ubc.id::text, ubc.crossing_date, ubc.planned_crossing_date, ubc.direction,
                 ubc.port_of_entry, ubc.commodity, ubc.emanifest_reference, ubc.emanifest_status,
                 ubc.customs_broker_status, ubc.wizard_completed_at,
                 ubc.unit_id::text, ubc.driver_id::text, ubc.load_id::text, ubc.customs_broker_id::text,
                 u.unit_number, d.first_name || ' ' || d.last_name AS driver_name,
                 l.load_number, v.vendor_name AS customs_broker_name
          FROM mdata.unit_border_crossings ubc
          LEFT JOIN mdata.units u ON u.id = ubc.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ubc.operating_company_id
          LEFT JOIN mdata.drivers d ON d.id = ubc.driver_id
                                   AND (
                                     d.operating_company_id = ubc.operating_company_id
                                     OR EXISTS (
                                       SELECT 1
                                       FROM mdata.driver_company_authorizations border_history_list_dca
                                       WHERE border_history_list_dca.driver_id = d.id
                                         AND border_history_list_dca.company_id = ubc.operating_company_id
                                         AND border_history_list_dca.is_authorized = true
                                         AND border_history_list_dca.deactivated_at IS NULL
                                     )
                                   )
          LEFT JOIN mdata.loads l ON l.id = ubc.load_id
                                 AND l.operating_company_id = ubc.operating_company_id
          LEFT JOIN mdata.vendors v ON v.id = ubc.customs_broker_id
                                   AND v.operating_company_id = ubc.operating_company_id
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

  // X.5 — read-only contract consumed by the Driver Instruction Sheet. Whether the Customs
  // treatment is shown remains exclusively owned by LoadDetailDrawer.loadHasCrossBorder(); this
  // endpoint deliberately does not introduce a second cross-border predicate.
  app.get("/api/v1/border-crossing/loads/:id/driver-instructions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const instruction = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          SELECT
            l.id::text AS load_id,
            COALESCE(port.name, instruction_crossing.port_of_entry, border_stop.city) AS port_of_entry,
            COALESCE(port.cbp_port_code, (regexp_match(border_stop.stop_notes, 'CBP[[:space:]]+([0-9A-Za-z-]+)'))[1]) AS cbp_port_code,
            instruction_crossing.customs_broker_id::text AS customs_broker_id,
            broker.vendor_name AS customs_broker_name,
            broker.phone AS customs_broker_phone,
            broker.email AS customs_broker_email,
            COALESCE(instruction_crossing.manifest_number, instruction_crossing.ace_emanifest_ref, instruction_crossing.emanifest_reference) AS pedimento_entry_number,
            COALESCE(instruction_crossing.notes, l.border_routing, border_stop.stop_notes) AS crossing_instructions
          FROM mdata.loads l
          LEFT JOIN LATERAL (
            SELECT instruction_crossing.*
            FROM mdata.unit_border_crossings instruction_crossing
            WHERE instruction_crossing.load_id = l.id
              AND instruction_crossing.operating_company_id = l.operating_company_id
            ORDER BY instruction_crossing.wizard_completed_at DESC NULLS LAST,
                     instruction_crossing.crossing_date DESC,
                     instruction_crossing.id
            LIMIT 1
          ) instruction_crossing ON true
          LEFT JOIN LATERAL (
            SELECT load_stop.city, load_stop.stop_notes
            FROM mdata.load_stops load_stop
            WHERE load_stop.load_id = l.id
              AND load_stop.stop_type = 'border'
              AND load_stop.soft_deleted_at IS NULL
            ORDER BY load_stop.sequence_number, load_stop.id
            LIMIT 1
          ) border_stop ON true
          LEFT JOIN reference.ports_of_entry port ON port.id = instruction_crossing.port_of_entry_id
          LEFT JOIN mdata.vendors broker
            ON broker.id = instruction_crossing.customs_broker_id
           AND broker.operating_company_id = l.operating_company_id
           AND broker.deactivated_at IS NULL
          WHERE l.id = $1::uuid
            AND l.operating_company_id = $2::uuid
            AND l.soft_deleted_at IS NULL
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return result.rows[0] ?? null;
    });

    if (!instruction) return reply.code(404).send({ error: "not_found" });
    return reply.send({ instruction });
  });

  app.get("/api/v1/border-crossing/history/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
                 v.vendor_name AS customs_broker_name,
                 p.short_name AS port_short_name,
                 p.cbp_port_code
          FROM mdata.unit_border_crossings ubc
          LEFT JOIN mdata.units u ON u.id = ubc.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ubc.operating_company_id
          LEFT JOIN mdata.drivers d ON d.id = ubc.driver_id
                                   AND (
                                     d.operating_company_id = ubc.operating_company_id
                                     OR EXISTS (
                                       SELECT 1
                                       FROM mdata.driver_company_authorizations border_history_detail_dca
                                       WHERE border_history_detail_dca.driver_id = d.id
                                         AND border_history_detail_dca.company_id = ubc.operating_company_id
                                         AND border_history_detail_dca.is_authorized = true
                                         AND border_history_detail_dca.deactivated_at IS NULL
                                     )
                                   )
          LEFT JOIN mdata.loads l ON l.id = ubc.load_id
                                 AND l.operating_company_id = ubc.operating_company_id
          LEFT JOIN mdata.vendors v ON v.id = ubc.customs_broker_id
                                    AND v.operating_company_id = $2::uuid
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
