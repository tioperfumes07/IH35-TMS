import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
  equipment_kind: z.enum(["truck", "trailer"]),
  equipment_id: z.string().uuid(),
  driver_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

async function assertDriverScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  driverId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT d.id::text
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND d.status = 'Active'
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid AND dca.is_authorized = true AND dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

async function assertUnitScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  unitId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

async function assertTrailerScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  equipmentId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.equipment
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [equipmentId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

export async function registerAssignmentsQuicksaveRoutes(app: FastifyInstance) {
  app.post("/api/v1/assignments/quicksave", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const { operating_company_id: companyId, equipment_kind: kind, equipment_id: equipmentId, driver_id: driverId } =
      parsed.data;

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
      const driverOk = await assertDriverScope(client, driverId, companyId);
      if (!driverOk) return { error: "driver_not_eligible" as const };

      if (kind === "truck") {
        const unitOk = await assertUnitScope(client, equipmentId, companyId);
        if (!unitOk) return { error: "equipment_not_found" as const };

        await client.query(
          `
            UPDATE telematics.vehicle_driver_assignments
            SET ended_at = now()
            WHERE unit_id = $1::uuid
              AND operating_company_id = $2::uuid
              AND is_default = true
              AND ended_at IS NULL
          `,
          [equipmentId, companyId]
        );
        await client.query(
          `
            UPDATE telematics.vehicle_driver_assignments
            SET ended_at = now()
            WHERE driver_id = $1::uuid
              AND operating_company_id = $2::uuid
              AND is_default = true
              AND ended_at IS NULL
          `,
          [driverId, companyId]
        );
        await client.query(
          `
            INSERT INTO telematics.vehicle_driver_assignments (
              operating_company_id, unit_id, driver_id, started_at, source, is_default, created_by_user_uuid
            ) VALUES ($1, $2, $3, now(), 'quicksave', true, $4)
          `,
          [companyId, equipmentId, driverId, user.uuid]
        );
        await client.query(
          `
            UPDATE mdata.units
            SET assigned_driver_id = $3::uuid, updated_at = now()
            WHERE id = $1::uuid
              AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
          `,
          [equipmentId, companyId, driverId]
        );
        await appendCrudAudit(client, user.uuid, "assignments.quicksave_truck", {
          unit_id: equipmentId,
          driver_id: driverId,
          operating_company_id: companyId,
        });
        return { ok: true as const, equipment_kind: kind, equipment_id: equipmentId, driver_id: driverId };
      }

      const trailerOk = await assertTrailerScope(client, equipmentId, companyId);
      if (!trailerOk) return { error: "equipment_not_found" as const };

      await client.query(
        `
          UPDATE mdata.equipment
          SET assigned_driver_id = $3::uuid, updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
        `,
        [equipmentId, companyId, driverId]
      );
      await appendCrudAudit(client, user.uuid, "assignments.quicksave_trailer", {
        equipment_id: equipmentId,
        driver_id: driverId,
        operating_company_id: companyId,
      });
      return { ok: true as const, equipment_kind: kind, equipment_id: equipmentId, driver_id: driverId };
    });

    if ("error" in result) {
      if (result.error === "driver_not_eligible") return reply.code(404).send({ error: "driver_not_eligible" });
      return reply.code(404).send({ error: "equipment_not_found" });
    }
    return result;
  });
}
