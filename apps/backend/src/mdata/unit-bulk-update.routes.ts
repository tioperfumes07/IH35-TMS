import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { unitStatusSchema } from "./units.routes.js";

const bulkStatusInputSchema = z.enum(["Active", "Sold", "Transferred", "Damaged", "OOS"]);

const bulkStatusToDb: Record<z.infer<typeof bulkStatusInputSchema>, z.infer<typeof unitStatusSchema>> = {
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
  unit_ids: z.array(z.string().uuid()).min(1).max(100),
  patch: z
    .object({
      status: bulkStatusInputSchema.optional(),
      vehicle_type: z.string().trim().min(1).max(80).optional(),
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

async function unitTableHasColumn(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> },
  columnName: string
): Promise<boolean> {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'mdata'
          AND table_name = 'units'
          AND column_name = $1
      ) AS ok
    `,
    [columnName]
  );
  return Boolean(res.rows[0]?.ok);
}

export async function registerUnitBulkUpdateRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/units/bulk-update", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedQuery = bulkUpdateQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const parsedBody = bulkUpdateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const { unit_ids, patch } = parsedBody.data;
    if (unit_ids.length > 100) {
      return reply.code(400).send({ error: "too_many_unit_ids", max: 100 });
    }

    const operating_company_id = parsedQuery.data.operating_company_id;
    const dbStatus = patch.status ? bulkStatusToDb[patch.status] : undefined;

    try {
      const payload = await withCurrentUser(authUser.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

        const setParts: string[] = [];
        const values: unknown[] = [unit_ids, operating_company_id];
        const add = (col: string, val: unknown) => {
          values.push(val);
          setParts.push(`${col} = $${values.length}`);
        };

        if (dbStatus) {
          add("status", dbStatus);
          add("status_changed_at", new Date().toISOString());
          add("status_changed_by_user_id", authUser.uuid);
          if (dbStatus === "OutOfService") {
            add("is_oos", true);
          }
        }

        if (patch.vehicle_type) {
          const hasVehicleType = await unitTableHasColumn(client, "vehicle_type");
          if (hasVehicleType) {
            add("vehicle_type", patch.vehicle_type);
          }
        }

        add("updated_by_user_id", authUser.uuid);
        setParts.push("updated_at = now()");

        const oldRes = await client.query(
          `
            SELECT *
            FROM mdata.units
            WHERE id = ANY($1::uuid[])
              AND (
                owner_company_id = $2::uuid
                OR currently_leased_to_company_id = $2::uuid
              ) /* operating_company_id tenant scope */
              /* operating_company_id tenant scope */
          `,
          [unit_ids, operating_company_id]
        );
        const oldById = new Map(
          oldRes.rows.map((row) => [(row as { id: string }).id, row as Record<string, unknown>])
        );

        const updateRes = await client.query(
          `
            UPDATE mdata.units
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
              ...(patch.vehicle_type ? { vehicle_type: patch.vehicle_type } : {}),
            },
            oldRow,
            row
          );
          await appendCrudAudit(client, authUser.uuid, "unit.bulk_update", {
            resource_id: row.id,
            resource_type: "mdata.units",
            operating_company_id,
            changes,
            patch,
          });
        }

        return { affected_count: updateRes.rowCount ?? 0 };
      });

      return payload;
    } catch (err) {
      throw err;
    }
  });
}
