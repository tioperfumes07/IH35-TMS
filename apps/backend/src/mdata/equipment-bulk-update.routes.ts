import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const equipmentStatusSchema = z.enum([
  "InService",
  "OutOfService",
  "InMaintenance",
  "Sold",
  "Lost",
  "Damaged",
  "Transferred",
]);

const equipmentTypeSchema = z.enum([
  "DryVan",
  "Reefer",
  "Flatbed",
  "Tanker",
  "Container",
  "Chassis",
  "StepDeck",
  "Lowboy",
  "Conestoga",
  "RGN",
  "Other",
]);

const bulkStatusInputSchema = z.enum(["Active", "Sold", "Transferred", "Damaged", "OOS"]);

const bulkStatusToDb: Record<z.infer<typeof bulkStatusInputSchema>, z.infer<typeof equipmentStatusSchema>> = {
  Active: "InService",
  Sold: "Sold",
  Transferred: "Transferred",
  Damaged: "Damaged",
  OOS: "OutOfService",
};

const bulkUpdateQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const bulkUpdateBodySchema = z.object({
  equipment_ids: z.array(z.string().uuid()).min(1).max(100),
  patch: z
    .object({
      status: bulkStatusInputSchema.optional(),
      equipment_type: equipmentTypeSchema.optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "patch must include at least one field" }),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export async function registerEquipmentBulkUpdateRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/equipment/bulk-update", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedQuery = bulkUpdateQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const parsedBody = bulkUpdateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const { equipment_ids, patch } = parsedBody.data;
    if (equipment_ids.length > 100) {
      return reply.code(400).send({ error: "too_many_equipment_ids", max: 100 });
    }

    const operating_company_id = parsedQuery.data.operating_company_id;
    const dbStatus = patch.status ? bulkStatusToDb[patch.status] : undefined;

    const payload = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

      const setParts: string[] = [];
      const values: unknown[] = [equipment_ids, operating_company_id];
      const add = (col: string, val: unknown) => {
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };

      if (dbStatus) {
        add("status", dbStatus);
      }
      if (patch.equipment_type) {
        add("equipment_type", patch.equipment_type);
      }
      add("updated_by_user_id", authUser.uuid);
      setParts.push("updated_at = now()");

      const oldRes = await client.query(
        `
          SELECT *
          FROM mdata.equipment
          WHERE id = ANY($1::uuid[])
            AND (
              owner_company_id = $2::uuid
              OR currently_leased_to_company_id = $2::uuid
            ) /* operating_company_id tenant scope */
            /* operating_company_id tenant scope */
        `,
        [equipment_ids, operating_company_id]
      );
      const oldById = new Map(
        oldRes.rows.map((row) => [(row as { id: string }).id, row as Record<string, unknown>])
      );

      const updateRes = await client.query(
        `
          UPDATE mdata.equipment
          SET ${setParts.join(", ")}
          WHERE id = ANY($1::uuid[])
            AND (
              owner_company_id = $2::uuid
              OR currently_leased_to_company_id = $2::uuid
            ) /* operating_company_id tenant scope */
            /* operating_company_id tenant scope */
          RETURNING *
        `,
        values
      );

      for (const updatedRow of updateRes.rows) {
        const row = updatedRow as Record<string, unknown>;
        const oldRow = oldById.get(String(row.id)) ?? {};
        const changes = buildPatchChanges(
          {
            ...(dbStatus ? { status: dbStatus } : {}),
            ...(patch.equipment_type ? { equipment_type: patch.equipment_type } : {}),
          },
          oldRow,
          row
        );
        await appendCrudAudit(client, authUser.uuid, "equipment.bulk_update", {
          resource_id: row.id,
          resource_type: "mdata.equipment",
          operating_company_id,
          changes,
          patch,
        });
      }

      return { affected_count: updateRes.rowCount ?? 0 };
    });

    return payload;
  });
}
