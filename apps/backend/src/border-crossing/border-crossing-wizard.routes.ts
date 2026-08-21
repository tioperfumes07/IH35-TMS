import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../reports/shared.js";
import { getCachedCbpWaitTimes } from "./cbp-wait-times.service.js";
import { renderEmanifestPdf } from "./emanifest-pdf-renderer.service.js";

const wizardBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid().optional(),
  unit_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  direction: z.enum(["northbound", "southbound"]),
  port_of_entry_id: z.string().uuid(),
  planned_date: z.string().datetime({ offset: true }).or(z.string().date()),
  commodity: z.string().trim().min(1).max(500),
  commodity_value: z.coerce.number().nonnegative().optional(),
  weight: z.coerce.number().int().nonnegative().optional(),
  hazmat: z.boolean().default(false),
  customs_broker_id: z.string().uuid().optional(),
  bond_number: z.string().trim().max(100).optional(),
});

const waitTimesQuerySchema = z.object({
  cbp_port_code: z.string().trim().min(1).max(20),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

function generateEmanifestReference() {
  return `EM-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function parseFastCardWarning(fastCardExpiration: string | null | undefined) {
  if (!fastCardExpiration) {
    return { verified: false, warning: "Driver FAST card not on file" };
  }
  const exp = new Date(fastCardExpiration);
  if (Number.isNaN(exp.getTime())) {
    return { verified: false, warning: "Driver FAST card expiration invalid" };
  }
  if (exp < new Date()) {
    return { verified: false, warning: "Driver FAST card is expired" };
  }
  return { verified: true, warning: null as string | null };
}

export async function registerBorderCrossingWizardRoutes(app: FastifyInstance) {
  app.get("/api/v1/border-crossing/ports-of-entry", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT id::text, name, short_name, country, state_or_province, city, border_country, cbp_port_code, active
          FROM reference.ports_of_entry
          WHERE active = true
          ORDER BY country, name
        `
      );
      return res.rows;
    });
    return reply.send({ ports: rows });
  });

  app.get("/api/v1/border-crossing/wait-times", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = waitTimesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCurrentUser(user.uuid, async (client) =>
      getCachedCbpWaitTimes(client, parsed.data.cbp_port_code)
    );
    return reply.send(payload);
  });

  app.get("/api/v1/border-crossing/customs-brokers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id::text, vendor_name AS name, vendor_category
          FROM mdata.vendors
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
            AND vendor_category = 'customs_broker'
          ORDER BY vendor_name
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return reply.send({ brokers: rows });
  });

  app.post("/api/v1/border-crossing/wizard", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = wizardBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const data = parsed.data;
    const commodityValueCents =
      data.commodity_value != null ? Math.round(data.commodity_value * 100) : null;

    const result = await withCompanyScope(user.uuid, data.operating_company_id, async (client) => {
      const unitRes = await client.query(
        `SELECT id
           FROM mdata.units
          WHERE id = $1::uuid
            AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1`,
        [data.unit_id, data.operating_company_id]
      );
      if (!unitRes.rows[0]) {
        throw Object.assign(new Error("linked_entity_not_in_operating_company"), { statusCode: 400 });
      }
      if (data.load_id) {
        const loadRes = await client.query(
          `SELECT id
             FROM mdata.loads
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
              AND soft_deleted_at IS NULL
            LIMIT 1`,
          [data.load_id, data.operating_company_id]
        );
        if (!loadRes.rows[0]) {
          throw Object.assign(new Error("linked_entity_not_in_operating_company"), { statusCode: 400 });
        }
      }
      if (data.customs_broker_id) {
        const brokerRes = await client.query(
          `SELECT id
             FROM mdata.vendors
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
              AND deactivated_at IS NULL
              AND vendor_category = 'customs_broker'
            LIMIT 1`,
          [data.customs_broker_id, data.operating_company_id]
        );
        if (!brokerRes.rows[0]) {
          throw Object.assign(new Error("linked_entity_not_in_operating_company"), { statusCode: 400 });
        }
      }
      const portRes = await client.query(
        `SELECT name, cbp_port_code FROM reference.ports_of_entry WHERE id = $1::uuid`,
        [data.port_of_entry_id]
      );
      const port = portRes.rows[0] as { name: string; cbp_port_code: string | null } | undefined;
      if (!port) throw Object.assign(new Error("port_not_found"), { statusCode: 404 });

      let fastCardWarning: string | null = null;
      let fastVerified = false;
      if (data.driver_id) {
        const driverRes = await client.query(
          `SELECT id, fast_card_expiration
             FROM mdata.drivers
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
              AND deactivated_at IS NULL
              AND archived_at IS NULL
            LIMIT 1`,
          [data.driver_id, data.operating_company_id]
        );
        if (!driverRes.rows[0]) {
          throw Object.assign(new Error("linked_entity_not_in_operating_company"), { statusCode: 400 });
        }
        const check = parseFastCardWarning(
          (driverRes.rows[0] as { fast_card_expiration: string | null } | undefined)?.fast_card_expiration
        );
        fastVerified = check.verified;
        fastCardWarning = check.warning;
      }

      const emanifestRef = generateEmanifestReference();
      const crossingDate = new Date(data.planned_date).toISOString();

      const insert = await client.query(
        `
          INSERT INTO mdata.unit_border_crossings (
            operating_company_id, unit_id, driver_id, load_id, crossing_date, direction,
            port_of_entry, port_of_entry_id, planned_crossing_date, commodity, commodity_value_cents,
            cargo_weight_lbs, customs_broker_id, customs_broker_status, emanifest_status,
            emanifest_reference, ace_emanifest_ref, driver_fast_card_verified, hazmat_declared,
            bond_number, wizard_completed_at, wizard_completed_by_user_id
          )
          VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6,
            $7, $8::uuid, $5::timestamptz, $9, $10, $11, $12::uuid, 'docs_pending', 'draft',
            $13, $13, $14, $15, $16, NOW(), $17::uuid
          )
          RETURNING id::text, emanifest_reference, wizard_completed_at
        `,
        [
          data.operating_company_id,
          data.unit_id,
          data.driver_id ?? null,
          data.load_id ?? null,
          crossingDate,
          data.direction,
          port.name,
          data.port_of_entry_id,
          data.commodity,
          commodityValueCents,
          data.weight ?? null,
          data.customs_broker_id ?? null,
          emanifestRef,
          fastVerified,
          data.hazmat,
          data.bond_number ?? null,
          user.uuid,
        ]
      );

      return {
        crossing: insert.rows[0],
        fast_card_verified: fastVerified,
        fast_card_warning: fastCardWarning,
        port,
      };
    });

    return reply.send({
      ok: true,
      crossing_id: result.crossing.id,
      emanifest_reference: result.crossing.emanifest_reference,
      wizard_completed_at: result.crossing.wizard_completed_at,
      fast_card_verified: result.fast_card_verified,
      fast_card_warning: result.fast_card_warning,
      summary: {
        direction: data.direction,
        port_of_entry: result.port.name,
        cbp_port_code: result.port.cbp_port_code,
      },
    });
  });

  app.get("/api/v1/border-crossing/:id/emanifest.pdf", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
                 v.vendor_name AS customs_broker_name
          FROM mdata.unit_border_crossings ubc
          LEFT JOIN mdata.units u ON u.id = ubc.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ubc.operating_company_id
          LEFT JOIN mdata.drivers d ON d.id = ubc.driver_id
                                   AND d.operating_company_id = ubc.operating_company_id
          LEFT JOIN mdata.loads l ON l.id = ubc.load_id
                                 AND l.operating_company_id = ubc.operating_company_id
          LEFT JOIN mdata.vendors v ON v.id = ubc.customs_broker_id
                                   AND v.operating_company_id = ubc.operating_company_id
          WHERE ubc.id = $1::uuid
            AND ubc.operating_company_id = $2::uuid
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0];
    });

    if (!row) return reply.code(404).send({ error: "not_found" });

    const pdf = await renderEmanifestPdf({
      emanifestReference: String(row.emanifest_reference ?? row.ace_emanifest_ref ?? "DRAFT"),
      direction: String(row.direction),
      portOfEntry: String(row.port_of_entry),
      plannedDate: String(row.planned_crossing_date ?? row.crossing_date),
      commodity: String(row.commodity ?? ""),
      cargoWeightLbs: row.cargo_weight_lbs as number | null,
      commodityValueCents: row.commodity_value_cents as number | null,
      hazmatDeclared: Boolean(row.hazmat_declared),
      bondNumber: (row.bond_number as string | null) ?? null,
      driverName: (row.driver_name as string | null) ?? null,
      unitNumber: (row.unit_number as string | null) ?? null,
      loadReference: (row.load_number as string | null) ?? null,
      customsBrokerName: (row.customs_broker_name as string | null) ?? null,
    });

    return reply
      .header("Content-Type", pdf.mimeType)
      .header("Content-Disposition", `attachment; filename="${pdf.filename}"`)
      .send(pdf.pdfBuffer);
  });
}

export { parseFastCardWarning };
