import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import {
  appendLegacyFleetBulkAudit,
  assertExactFleetBulkTargetCount,
  FLEET_BULK_MAX_IDS,
  FleetBulkTargetMismatchError,
  sendFleetBulkTargetMismatch,
  withLegacyBulkRequest,
} from "../bulk/bulk-update.factory.js";
import { withCurrentUser } from "../auth/db.js";
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
  unit_ids: z.array(z.string().uuid()).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, { message: "unit_ids must be unique" }),
  patch: z
    .object({
      status: bulkStatusInputSchema.optional(),
      vehicle_type: z.string().trim().min(1).max(80).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "patch must include at least one field" }),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
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
    return withLegacyBulkRequest(req, reply, async ({ authUser, bulkCallId }) => {
      const parsedQuery = bulkUpdateQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

      const parsedBody = bulkUpdateBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

      const { unit_ids, patch } = parsedBody.data;
      if (unit_ids.length > FLEET_BULK_MAX_IDS) {
        return reply.code(400).send({ error: "too_many_unit_ids", max: FLEET_BULK_MAX_IDS });
      }

      const operating_company_id = parsedQuery.data.operating_company_id;
      const dbStatus = patch.status ? bulkStatusToDb[patch.status] : undefined;

      try {
      const payload = await withCurrentUser(authUser.uuid, async (client) => {
        await setScopedCompanyContext(client, authUser.uuid, operating_company_id);

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
          // Status is authoritative: entering OOS sets the dispatch guard, and returning to any
          // other canonical fleet status clears a stale OOS flag.
          add("is_oos", dbStatus === "OutOfService");
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
        assertExactFleetBulkTargetCount(unit_ids.length, oldRes.rows.length, "pre_update");
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
        assertExactFleetBulkTargetCount(unit_ids.length, updateRes.rows.length, "post_update");

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
          await appendLegacyFleetBulkAudit({
            client,
            actorUserId: authUser.uuid,
            eventClass: "unit.bulk_update",
            bulkCallId,
            payload: {
              resource_id: row.id,
              resource_type: "mdata.units",
              operating_company_id,
              changes,
              patch,
            },
          });
        }

        return { affected_count: updateRes.rowCount ?? 0 };
      });

      return payload;
      } catch (error) {
        if (error instanceof FleetBulkTargetMismatchError) return sendFleetBulkTargetMismatch(reply, error);
        throw error;
      }
    });
  });
}
