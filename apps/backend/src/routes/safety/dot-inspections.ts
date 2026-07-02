import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { createWorkOrderWithLines } from "../../maintenance/two-section-service.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const cleanRateQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const dotInspectionSchema = z.object({
  inspection_date: z.string(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  inspector_name: z.string().trim().min(1),
  inspection_level: z.number().int().min(1).max(6),
  location: z.string().optional(),
  outcome: z.enum(["PASS", "WARNING", "OOS"]),
  notes: z.string().optional(),
  csa_points_unsafe_driving: z.number().int().optional(),
  csa_points_crash_indicator: z.number().int().optional(),
  csa_points_hos: z.number().int().optional(),
  csa_points_vehicle_maintenance: z.number().int().optional(),
  csa_points_controlled_substances: z.number().int().optional(),
  csa_points_driver_fitness: z.number().int().optional(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client);
  });
}

async function recomputeCsa(client: any, companyId: string, actorId: string) {
  const res = await client.query(
    `
      SELECT
        COALESCE(SUM(csa_points_unsafe_driving), 0)::numeric(8,2) AS basic_unsafe_driving,
        COALESCE(SUM(csa_points_crash_indicator), 0)::numeric(8,2) AS basic_crash_indicator,
        COALESCE(SUM(csa_points_hos), 0)::numeric(8,2) AS basic_hos_compliance,
        COALESCE(SUM(csa_points_vehicle_maintenance), 0)::numeric(8,2) AS basic_vehicle_maintenance,
        COALESCE(SUM(csa_points_controlled_substances), 0)::numeric(8,2) AS basic_controlled_substances,
        COALESCE(SUM(csa_points_driver_fitness), 0)::numeric(8,2) AS basic_driver_fitness,
        COUNT(*)::int AS source_dot_inspection_count
      FROM safety.dot_inspections
      WHERE operating_company_id = $1
        AND inspection_date >= (CURRENT_DATE - INTERVAL '365 days')
    `,
    [companyId]
  );
  const row = res.rows[0];
  const total =
    Number(row.basic_unsafe_driving || 0) +
    Number(row.basic_crash_indicator || 0) +
    Number(row.basic_hos_compliance || 0) +
    Number(row.basic_vehicle_maintenance || 0) +
    Number(row.basic_controlled_substances || 0) +
    Number(row.basic_driver_fitness || 0);

  const upsert = await client.query(
    `
      INSERT INTO safety.csa_scores (
        operating_company_id,
        score_date,
        basic_unsafe_driving,
        basic_crash_indicator,
        basic_hos_compliance,
        basic_vehicle_maintenance,
        basic_controlled_substances,
        basic_driver_fitness,
        basic_hazmat,
        total_points,
        source_dot_inspection_count
      )
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, NULL, $8, $9)
      ON CONFLICT (operating_company_id, score_date)
      DO UPDATE SET
        basic_unsafe_driving = EXCLUDED.basic_unsafe_driving,
        basic_crash_indicator = EXCLUDED.basic_crash_indicator,
        basic_hos_compliance = EXCLUDED.basic_hos_compliance,
        basic_vehicle_maintenance = EXCLUDED.basic_vehicle_maintenance,
        basic_controlled_substances = EXCLUDED.basic_controlled_substances,
        basic_driver_fitness = EXCLUDED.basic_driver_fitness,
        basic_hazmat = NULL,
        total_points = EXCLUDED.total_points,
        source_dot_inspection_count = EXCLUDED.source_dot_inspection_count
      RETURNING *
    `,
    [
      companyId,
      row.basic_unsafe_driving,
      row.basic_crash_indicator,
      row.basic_hos_compliance,
      row.basic_vehicle_maintenance,
      row.basic_controlled_substances,
      row.basic_driver_fitness,
      total,
      row.source_dot_inspection_count,
    ]
  );

  await appendCrudAudit(
    client,
    actorId,
    "safety.csa_score.recomputed",
    { csa_score_id: upsert.rows[0].id, score_date: upsert.rows[0].score_date, total_points: upsert.rows[0].total_points },
    "info",
    "P3-T11.17.2-SAFETY-V6.4"
  );

  return upsert.rows[0];
}

export async function registerSafetyDotInspectionsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/dot-inspections/clean-rate", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = cleanRateQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const trailingMonths = 12;
    const stats = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            COUNT(*)::int AS total_inspections,
            COUNT(*) FILTER (WHERE outcome <> 'OOS')::int AS clean_inspections
          FROM safety.dot_inspections
          WHERE operating_company_id = $1
            AND voided_at IS NULL
            AND inspection_date >= (CURRENT_DATE - make_interval(months => $2))
            AND ($3::uuid IS NULL OR driver_id = $3)
        `,
        [query.data.operating_company_id, trailingMonths, query.data.driver_id ?? null]
      );
      return res.rows[0];
    });

    const total = Number(stats.total_inspections ?? 0);
    const clean = Number(stats.clean_inspections ?? 0);
    const cleanRatePercent = total > 0 ? Math.round((clean / total) * 1000) / 10 : null;

    return {
      clean_rate_percent: cleanRatePercent,
      total_inspections: total,
      clean_inspections: clean,
      trailing_months: trailingMonths,
    };
  });

  app.get("/api/v1/safety/dot-inspections", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.dot_inspections
          WHERE operating_company_id = $1
          ORDER BY inspection_date DESC, created_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { dot_inspections: rows };
  });

  app.get("/api/v1/safety/dot-inspections/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.dot_inspections
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "dot_inspection_not_found" });
    return row;
  });

  app.post("/api/v1/safety/dot-inspections", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = dotInspectionSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      await client.query("BEGIN");
      try {
        const categoryList = [
          body.data.csa_points_unsafe_driving != null ? "unsafe_driving" : null,
          body.data.csa_points_crash_indicator != null ? "crash_indicator" : null,
          body.data.csa_points_hos != null ? "hos_compliance" : null,
          body.data.csa_points_vehicle_maintenance != null ? "vehicle_maintenance" : null,
          body.data.csa_points_controlled_substances != null ? "controlled_substances" : null,
          body.data.csa_points_driver_fitness != null ? "driver_fitness" : null,
        ].filter(Boolean);

        const totalPoints =
          Number(body.data.csa_points_unsafe_driving ?? 0) +
          Number(body.data.csa_points_crash_indicator ?? 0) +
          Number(body.data.csa_points_hos ?? 0) +
          Number(body.data.csa_points_vehicle_maintenance ?? 0) +
          Number(body.data.csa_points_controlled_substances ?? 0) +
          Number(body.data.csa_points_driver_fitness ?? 0);

        const createdRes = await client.query(
          `
            INSERT INTO safety.dot_inspections (
              operating_company_id, driver_id, unit_id, inspection_date, inspector_name, fmcsa_level, location, outcome,
              csa_basic_categories, csa_points, violations_jsonb, auto_spawned_wo_id, created_by, notes
            )
            VALUES ($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13)
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            body.data.driver_id ?? null,
            body.data.unit_id ?? null,
            body.data.inspection_date,
            body.data.inspector_name,
            body.data.inspection_level,
            body.data.location ?? null,
            body.data.outcome,
            categoryList,
            totalPoints,
            "{}",
            user.uuid,
            body.data.notes ?? null,
          ]
        );
        const inspection = createdRes.rows[0];

        let spawnedWo: { woUuid: string; display_id: string } | null = null;
        if (inspection.outcome === "OOS" && inspection.unit_id) {
          const createdWo = await createWorkOrderWithLines(
            client,
            user.uuid,
            {
              operating_company_id: query.data.operating_company_id,
              wo_type: "repair",
              source_type: "AC",
              unit_id: inspection.unit_id,
              driver_id: inspection.driver_id ?? null,
              description: `Auto-created from DOT OOS inspection ${inspection.id}`,
              repair_location: "in_house",
              payment_timing: "in_house",
            },
            [],
            [
              {
                description: `DOT OOS violations for inspection ${inspection.id}`,
                quantity: 1,
                unit_cost: 0,
                amount: 0,
                service_item_uuid: inspection.id,
                sub_rows: [
                  {
                    line_type: "labor",
                    description: "Review and resolve OOS findings",
                    quantity: 1,
                    unit_cost: 0,
                    amount: 0,
                  },
                ],
              },
            ]
          );
          spawnedWo = { woUuid: createdWo.woUuid, display_id: createdWo.display_id };
          await client.query(
            `UPDATE safety.dot_inspections SET auto_spawned_wo_id = $2 WHERE id = $1`,
            [inspection.id, createdWo.woUuid]
          );
          await appendCrudAudit(
            client,
            user.uuid,
            "safety.dot_inspection.oos_spawned_wo",
            { dot_inspection_id: inspection.id, spawned_wo_id: createdWo.woUuid },
            "warning",
            "P3-T11.17.2-SAFETY-V6.4"
          );
        }

        const csaScore = await recomputeCsa(client, query.data.operating_company_id, user.uuid);

        await appendCrudAudit(
          client,
          user.uuid,
          "safety.dot_inspection.created",
          { dot_inspection_id: inspection.id, outcome: inspection.outcome, csa_score_id: csaScore.id },
          inspection.outcome === "OOS" ? "warning" : "info",
          "P3-T11.17.2-SAFETY-V6.4"
        );
        await client.query("COMMIT");
        return { dot_inspection: inspection, spawned_wo: spawnedWo, csa_score: csaScore };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    return reply.code(201).send(payload);
  });

  app.post("/api/v1/safety/dot-inspections/:id/upload-pdf", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const pdfUrl = `r2://safety/dot-inspections/${params.data.id}/${Date.now()}-${file.filename}`;
      const updated = await client.query(
        `
          UPDATE safety.dot_inspections
          SET inspection_pdf_url = $2
          WHERE id = $1
            AND operating_company_id = $3
          RETURNING *
        `,
        [params.data.id, pdfUrl, query.data.operating_company_id]
      );
      const row = updated.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.dot_inspection.updated",
        { dot_inspection_id: row.id, inspection_pdf_url: pdfUrl },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });

    if (!payload) return reply.code(404).send({ error: "dot_inspection_not_found" });
    return { dot_inspection: payload };
  });

  app.post("/api/v1/safety/dot-inspections/:id/void", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const updated = await client.query(
        `
          UPDATE safety.dot_inspections
          SET voided_at = now(), voided_by = $2, void_reason = COALESCE(void_reason, 'voided via endpoint')
          WHERE id = $1
            AND operating_company_id = $3
            AND voided_at IS NULL
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id]
      );
      const row = updated.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.dot_inspection.voided",
        { dot_inspection_id: row.id },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });
    if (!payload) return reply.code(404).send({ error: "dot_inspection_not_found" });
    return { dot_inspection: payload };
  });
}
