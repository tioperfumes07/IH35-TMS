import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { validateTrailerStatusTransition } from "./trailer-status-state-machine.js";

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

const idParamSchema = z.object({ id: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

const statusPutBodySchema = z.object({
  status: equipmentStatusSchema,
  reason: z.string().trim().min(1).max(2000),
  note: z.string().trim().max(2000).optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  admin_override: z.boolean().optional(),
  sold_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sold_to: z.string().trim().max(200).optional(),
  sold_price: z.number().optional(),
  transferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  transferred_to_entity: z.enum(["TRK", "TRANSP", "USMCA"]).optional(),
  damage_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  damage_description: z.string().trim().max(2000).optional(),
  oos_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  oos_reason: z.string().trim().max(2000).optional(),
});

const patchTrailerBodySchema = z
  .object({
    equipment_number: z.string().trim().min(1).max(100).optional(),
    vin: z.string().trim().max(100).nullable().optional(),
    equipment_type: equipmentTypeSchema.optional(),
    make: z.string().trim().max(100).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
    year: z.number().int().min(1980).max(2100).nullable().optional(),
    length_ft: z.number().int().min(1).max(200).nullable().optional(),
    width_ft: z.number().nullable().optional(),
    height_ft: z.number().nullable().optional(),
    max_payload_lbs: z.number().int().nullable().optional(),
    axle_count: z.number().int().nullable().optional(),
    suspension_type: z.string().trim().max(100).nullable().optional(),
    tire_size: z.string().trim().max(100).nullable().optional(),
    us_insurance_policy_number: z.string().trim().max(200).nullable().optional(),
    us_insurance_expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    mx_insurance_policy_number: z.string().trim().max(200).nullable().optional(),
    mx_insurance_expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

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

export async function registerTrailerFleetRoutes(app: FastifyInstance) {
  app.put("/api/v1/fleet/trailers/:id/status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = statusPutBodySchema.safeParse(req.body ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    if (!query.success) return sendValidationError(reply, query.error);
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const oldRes = await client.query<{ status: string }>(
        `
          SELECT status::text AS status
          FROM mdata.equipment
          WHERE id = $1::uuid
            AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
          LIMIT 1
        `,
        [parsedParams.data.id, query.data.operating_company_id]
      );
      const oldRow = oldRes.rows[0];
      if (!oldRow) return { kind: "not_found" as const };

      const transitionError = validateTrailerStatusTransition(oldRow.status, body.data.status, {
        adminOverride: body.data.admin_override,
        actorRole: authUser.role,
      });
      if (transitionError) {
        return { kind: "illegal_transition" as const, error: transitionError };
      }

      const reasonText = [body.data.reason, body.data.note].filter(Boolean).join(" — ");
      const setParts = [
        "status = $3::mdata.equipment_status",
        "status_changed_at = COALESCE($4::date, CURRENT_DATE)::timestamptz",
        "status_change_reason = $5",
        "updated_by_user_id = $6",
      ];
      const values: unknown[] = [
        parsedParams.data.id,
        query.data.operating_company_id,
        body.data.status,
        body.data.effective_date ?? null,
        reasonText,
        authUser.uuid,
      ];

      const addLifecycle = (col: string, val: unknown) => {
        if (val === undefined) return;
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };
      addLifecycle("sold_date", body.data.sold_date ?? undefined);
      addLifecycle("sold_to", body.data.sold_to ?? undefined);
      addLifecycle("sold_price", body.data.sold_price ?? undefined);
      addLifecycle("transferred_date", body.data.transferred_date ?? undefined);
      addLifecycle("transferred_to_entity", body.data.transferred_to_entity ?? undefined);
      addLifecycle("damage_date", body.data.damage_date ?? undefined);
      addLifecycle("damage_description", body.data.damage_description ?? undefined);
      addLifecycle("oos_date", body.data.oos_date ?? undefined);
      addLifecycle("oos_reason", body.data.oos_reason ?? undefined);

      const res = await client.query(
        `
          UPDATE mdata.equipment
          SET ${setParts.join(", ")}
          WHERE id = $1::uuid
            AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
          RETURNING id, status::text, status_changed_at::text, status_change_reason
        `,
        values
      );
      const row = res.rows[0];
      if (!row) return { kind: "not_found" as const };

      await appendCrudAudit(client, authUser.uuid, "fleet.trailer.status_changed", {
        resource_id: row.id,
        resource_type: "mdata.equipment",
        before_status: oldRow.status,
        after_status: body.data.status,
        reason: body.data.reason,
        note: body.data.note ?? null,
        effective_date: body.data.effective_date ?? null,
        lifecycle: {
          sold_date: body.data.sold_date ?? null,
          transferred_date: body.data.transferred_date ?? null,
          damage_date: body.data.damage_date ?? null,
          oos_date: body.data.oos_date ?? null,
        },
      });
      return { kind: "ok" as const, row };
    });

    if (updated.kind === "not_found") return reply.code(404).send({ error: "mdata_equipment_not_found" });
    if (updated.kind === "illegal_transition") return reply.code(422).send(updated.error);
    return updated.row;
  });

  app.patch("/api/v1/fleet/trailers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const parsedBody = patchTrailerBodySchema.safeParse(req.body ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    if (!query.success) return sendValidationError(reply, query.error);
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("equipment_number" in b) add("equipment_number", b.equipment_number ?? null);
    if ("vin" in b) add("vin", b.vin ?? null);
    if ("equipment_type" in b) add("equipment_type", b.equipment_type);
    if ("make" in b) add("make", b.make ?? null);
    if ("model" in b) add("model", b.model ?? null);
    if ("year" in b) add("year", b.year ?? null);
    if ("length_ft" in b) add("length_ft", b.length_ft ?? null);
    if ("width_ft" in b) add("width_ft", b.width_ft ?? null);
    if ("height_ft" in b) add("height_ft", b.height_ft ?? null);
    if ("max_payload_lbs" in b) add("max_payload_lbs", b.max_payload_lbs ?? null);
    if ("axle_count" in b) add("axle_count", b.axle_count ?? null);
    if ("suspension_type" in b) add("suspension_type", b.suspension_type ?? null);
    if ("tire_size" in b) add("tire_size", b.tire_size ?? null);
    if ("us_insurance_policy_number" in b) add("us_insurance_policy_number", b.us_insurance_policy_number ?? null);
    if ("us_insurance_expiration" in b) add("us_insurance_expiration", b.us_insurance_expiration ?? null);
    if ("mx_insurance_policy_number" in b) add("mx_insurance_policy_number", b.mx_insurance_policy_number ?? null);
    if ("mx_insurance_expiration" in b) add("mx_insurance_expiration", b.mx_insurance_expiration ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    add("updated_by_user_id", authUser.uuid);
    values.push(parsedParams.data.id);
    const idIdx = values.length;
    values.push(query.data.operating_company_id);
    const companyIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
        const oldRes = await client.query(
          `
            SELECT *
            FROM mdata.equipment
            WHERE id = $1::uuid
              AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
            LIMIT 1
          `,
          [parsedParams.data.id, query.data.operating_company_id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.equipment
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
              AND (owner_company_id = $${companyIdx}::uuid OR currently_leased_to_company_id = $${companyIdx}::uuid)
            RETURNING *
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        await appendCrudAudit(client, authUser.uuid, "fleet.trailer.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.equipment",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_equipment_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_equipment_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_equipment_fk_reference" });
      throw err;
    }
  });
}
