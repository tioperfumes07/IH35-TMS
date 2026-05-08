import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";

type DvirInspectionItem = {
  key: string;
  status: "pass" | "minor" | "major";
  note: string;
  photo_keys: string[];
};

const loadParamsSchema = z.object({
  loadId: z.string().uuid(),
});

const dvirItemSchema = z.object({
  key: z.string(),
  status: z.enum(["pass", "minor", "major"]),
  note: z.string(),
  photo_keys: z.array(z.string()),
});

const submitDvirBodySchema = z.object({
  load_id: z.string().uuid(),
  mode: z.enum(["pre", "post"]),
  unit: z.string().trim().min(1),
  trailer: z.string().trim().optional().default(""),
  odometer: z.number().int().nonnegative(),
  location: z.string().trim().min(1),
  certified_at: z.string().datetime({ offset: true }),
  signature_data_url: z.string().min(1),
  out_of_service: z.boolean(),
  items: z.array(dvirItemSchema).min(1),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverDvirRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/dvir", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const body = submitDvirBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      const loadRes = await client.query<{ id: string; operating_company_id: string; assigned_primary_driver_id: string | null; assigned_secondary_driver_id: string | null; assigned_unit_id: string | null }>(
        `
          SELECT id, operating_company_id, assigned_primary_driver_id, assigned_secondary_driver_id, assigned_unit_id
          FROM mdata.loads
          WHERE id = $1
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [body.data.load_id]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return { error: "load_not_found" as const };
      if (load.assigned_primary_driver_id !== driver.id && load.assigned_secondary_driver_id !== driver.id) return { error: "forbidden" as const };
      if (!load.assigned_unit_id) return { error: "load_missing_unit" as const };

      const unitRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.units
          WHERE id = $1
            OR unit_number = $2
          LIMIT 1
        `,
        [load.assigned_unit_id, body.data.unit]
      );
      const unit = unitRes.rows[0] ?? null;
      if (!unit) return { error: "unit_not_found" as const };

      const trailerRes = body.data.trailer
        ? await client.query<{ id: string }>(
            `
              SELECT id
              FROM mdata.units
              WHERE id::text = $1
                 OR unit_number = $1
              LIMIT 1
            `,
            [body.data.trailer]
          )
        : { rows: [] as Array<{ id: string }> };
      const trailerId = trailerRes.rows[0]?.id ?? null;

      const hasMajor = body.data.items.some((item) => item.status === "major");
      const dvirRes = await client.query<{ id: string }>(
        `
          INSERT INTO maintenance.dvir_submissions (
            operating_company_id,
            driver_id,
            load_id,
            unit_id,
            trailer_id,
            type,
            odometer,
            location,
            geo_lat,
            geo_lng,
            items,
            certified,
            signature_data_url,
            submitted_at,
            has_major_defect
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,$9::jsonb,true,$10,$11,$12)
          RETURNING id
        `,
        [
          load.operating_company_id,
          driver.id,
          load.id,
          unit.id,
          trailerId,
          body.data.mode === "pre" ? "pre_trip" : "post_trip",
          body.data.odometer,
          body.data.location,
          JSON.stringify(body.data.items),
          body.data.signature_data_url,
          body.data.certified_at,
          hasMajor,
        ]
      );
      const submissionId = dvirRes.rows[0]?.id;
      if (!submissionId) return { error: "dvir_insert_failed" as const };

      for (const item of body.data.items as DvirInspectionItem[]) {
        if (item.status === "pass") continue;
        await client.query(
          `
            INSERT INTO maintenance.defects (
              operating_company_id,
              dvir_submission_id,
              unit_id,
              item_name,
              severity,
              notes,
              photo_keys
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7::text[])
          `,
          [
            load.operating_company_id,
            submissionId,
            unit.id,
            item.key,
            item.status,
            item.note || "",
            item.photo_keys,
          ]
        );
      }

      if (hasMajor) {
        await client.query(
          `
            UPDATE mdata.units
            SET is_oos = true
            WHERE id = $1
          `,
          [unit.id]
        );
        await appendCrudAudit(
          client,
          req.user!.uuid,
          "maintenance.dvir_unit_oos",
          {
            resource_type: "mdata.units",
            resource_id: unit.id,
            dvir_submission_id: submissionId,
          },
          "warning",
          "WF-050"
        );
      }

      return { success: true as const, oos_flag: hasMajor, dvir_submission_id: submissionId };
    });

    if ("error" in result) {
      if (result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
      if (result.error === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
      return reply.code(400).send({ error: result.error });
    }
    return result;
  });

  app.get("/api/v1/driver/dvir/:loadId", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const driver = req.driver;
    if (!driver) return;

    const payload = await withCurrentUser(req.user!.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM maintenance.dvir_submissions
          WHERE load_id = $1
            AND driver_id = $2
            AND type = 'pre_trip'
          ORDER BY submitted_at DESC
          LIMIT 1
        `,
        [params.data.loadId, driver.id]
      );
      return res.rows[0] ?? null;
    });

    if (!payload) return reply.code(404).send({ error: "dvir_not_found" });
    return payload;
  });
}
