import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { createWorkOrderWithLines } from "../../maintenance/two-section-service.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { putObjectBytes, isR2Configured } from "../../storage/r2-client.js";
import { computeAndUpsertScore, INTERNAL_CSA_SOURCE_METADATA } from "./csa-scores.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

// SAF-F17 — unit / trailer profile reverse view. Both optional; absent = company-wide list.
const dotInspectionsListQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  trailer_id: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const cleanRateQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

// SAF-F11: void is reason-REQUIRED. The route previously accepted no body and wrote
// `void_reason = COALESCE(void_reason, 'voided via endpoint')`, so every void landed in the audit
// trail with a placeholder and no accountable explanation. Void-cancel governance is reason-required;
// min(3) matches the accounting void contract and VoidReasonModal's default minLength.
const voidBodySchema = z.object({
  void_reason: z.string().trim().min(3).max(500),
});

const dotInspectionSchema = z.object({
  inspection_date: z.string(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  // SAF-F17 / LST-F5163C — trailer is a first-class asset on DOT inspections (column live on
  // safety.dot_inspections.trailer_id → mdata.equipment). List already filtered it; create must write it.
  trailer_id: z.string().uuid().optional(),
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
  if (!requireAuth(req, reply)) return reply;
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
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [role]);
    return fn(client);
  });
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
          WHERE operating_company_id = $1::uuid
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
    // SAF-F17: optional asset scoping for the unit / trailer profile reverse safety section.
    // `safety.dot_inspections` carries BOTH `unit_id` and `trailer_id`, so both are filterable.
    // Filtered in SQL — this list is capped at LIMIT 500 and a client-side filter would silently
    // omit an asset's inspections past that cap.
    const query = dotInspectionsListQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters: string[] = [];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        filters.push(`AND di.driver_id = $${values.length}`);
      }
      if (query.data.unit_id) {
        values.push(query.data.unit_id);
        filters.push(`AND di.unit_id = $${values.length}`);
      }
      if (query.data.trailer_id) {
        values.push(query.data.trailer_id);
        filters.push(`AND di.trailer_id = $${values.length}`);
      }
      if (query.data.from) {
        values.push(query.data.from);
        filters.push(`AND di.inspection_date >= $${values.length}::date`);
      }
      if (query.data.to) {
        values.push(query.data.to);
        filters.push(`AND di.inspection_date <= $${values.length}::date`);
      }
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count
         FROM safety.dot_inspections di
         WHERE di.operating_company_id = $1::uuid
           AND di.voided_at IS NULL
           ${filters.join("\n           ")}`,
        values
      );
      values.push(query.data.limit, query.data.offset);
      // CLS-UUID-LABEL: this list never joined the driver/unit/WO names, so the frontend's
      // EntityLink rendered the raw driver_id/unit_id/auto_spawned_wo_id uuids with no label
      // (same class as LST-F105/107/108/109/111/112). Mirrors safety.accident_reports' join.
      const res = await client.query(
        `
          SELECT di.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                 u.unit_number AS unit_number,
                 tr.equipment_number AS trailer_number,
                 wo.display_id AS work_order_display_id
          FROM safety.dot_inspections di
          LEFT JOIN mdata.drivers d
            ON d.id = di.driver_id
           AND (d.operating_company_id = di.operating_company_id OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations dot_inspections_list_dca
             WHERE dot_inspections_list_dca.driver_id = d.id
               AND dot_inspections_list_dca.company_id = di.operating_company_id
               AND dot_inspections_list_dca.is_authorized = true
               AND dot_inspections_list_dca.deactivated_at IS NULL
           ))
          LEFT JOIN mdata.units u
            ON u.id = di.unit_id
           AND (u.owner_company_id = di.operating_company_id
                OR u.currently_leased_to_company_id = di.operating_company_id)
          LEFT JOIN mdata.equipment tr
            ON tr.id = di.trailer_id
           AND (tr.owner_company_id = di.operating_company_id
                OR tr.currently_leased_to_company_id = di.operating_company_id)
          LEFT JOIN maintenance.work_orders wo
            ON wo.id = di.auto_spawned_wo_id
          WHERE di.operating_company_id = $1::uuid
            AND di.voided_at IS NULL
          ${filters.join("\n          ")}
          ORDER BY di.inspection_date DESC, di.created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return { dot_inspections: result.rows, total_count: result.total_count };
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
            AND operating_company_id = $2::uuid
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
      try {
        const links = await client.query(
          `SELECT
             ($2::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.drivers d
               WHERE d.id = $2::uuid
                 AND (d.operating_company_id = $1::uuid OR EXISTS (
                   SELECT 1 FROM mdata.driver_company_authorizations dot_create_driver_dca
                   WHERE dot_create_driver_dca.driver_id = d.id
                     AND dot_create_driver_dca.company_id = $1::uuid
                     AND dot_create_driver_dca.is_authorized = true
                     AND dot_create_driver_dca.deactivated_at IS NULL
                 ))
             )) AS driver_ok,
             ($3::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.units u
               WHERE u.id = $3::uuid
                 AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)
             )) AS unit_ok,
             ($4::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.equipment e
               WHERE e.id = $4::uuid
                 AND (e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid)
             )) AS trailer_ok`,
          [
            query.data.operating_company_id,
            body.data.driver_id ?? null,
            body.data.unit_id ?? null,
            body.data.trailer_id ?? null,
          ]
        );
        const integrity = links.rows[0] as {
          driver_ok?: boolean;
          unit_ok?: boolean;
          trailer_ok?: boolean;
        } | undefined;
        if (!integrity?.driver_ok || !integrity.unit_ok || !integrity.trailer_ok) {
          return null;
        }
        const csaPointBreakdown = Object.fromEntries(
          Object.entries({
            unsafe_driving: body.data.csa_points_unsafe_driving,
            crash_indicator: body.data.csa_points_crash_indicator,
            hos_compliance: body.data.csa_points_hos,
            vehicle_maintenance: body.data.csa_points_vehicle_maintenance,
            controlled_substances: body.data.csa_points_controlled_substances,
            driver_fitness: body.data.csa_points_driver_fitness,
          }).filter((entry): entry is [string, number] => entry[1] != null)
        );
        const categoryList = Object.keys(csaPointBreakdown);
        const pointValues = Object.values(csaPointBreakdown);
        const totalPoints =
          pointValues.length > 0 ? pointValues.reduce((sum, value) => sum + value, 0) : null;
        const violationsJson = JSON.stringify({ csa_point_breakdown: csaPointBreakdown });

        const createdRes = await client.query(
          `
            INSERT INTO safety.dot_inspections (
              operating_company_id, driver_id, unit_id, trailer_id, inspection_date, inspector_name,
              inspection_level, fmcsa_level, location, outcome,
              csa_basic_categories, csa_points, violations_jsonb, auto_spawned_wo_id, created_by, notes
            )
            VALUES ($1,$2,$3,$4,$5::date,$6,$7::smallint,$7::integer,$8,$9,$10,$11,$12,NULL,$13,$14)
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            body.data.driver_id ?? null,
            body.data.unit_id ?? null,
            body.data.trailer_id ?? null,
            body.data.inspection_date,
            body.data.inspector_name,
            body.data.inspection_level,
            body.data.location ?? null,
            body.data.outcome,
            categoryList,
            totalPoints,
            violationsJson,
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
            { dot_inspection_id: inspection.id, operating_company_id: query.data.operating_company_id, spawned_wo_id: createdWo.woUuid },
            "warning",
            "P3-T11.17.2-SAFETY-V6.4"
          );
        }

        const csaScore = await computeAndUpsertScore(client, query.data.operating_company_id, user.uuid);

        await appendCrudAudit(
          client,
          user.uuid,
          "safety.dot_inspection.created",
          { dot_inspection_id: inspection.id, operating_company_id: query.data.operating_company_id, outcome: inspection.outcome, csa_score_id: csaScore.id },
          inspection.outcome === "OOS" ? "warning" : "info",
          "P3-T11.17.2-SAFETY-V6.4"
        );
        return {
          dot_inspection: inspection,
          spawned_wo: spawnedWo,
          csa_score: { ...csaScore, basic_hazmat: null },
          csa_source: INTERNAL_CSA_SOURCE_METADATA,
        };
      } catch (error) {
        throw error;
      }
    });

    if (!payload) return reply.code(400).send({ error: "linked_entity_not_in_operating_company" });
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
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const fileBuffer = await file.toBuffer();
    if (!fileBuffer || fileBuffer.length === 0) return reply.code(400).send({ error: "file_empty" });
    const contentType = file.mimetype || "application/pdf";
    const r2Key = `safety/dot-inspections/${params.data.id}/${Date.now()}-${file.filename}`;
    await putObjectBytes(r2Key, fileBuffer, contentType);

    const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const pdfUrl = `r2://${r2Key}`;
      const updated = await client.query(
        `
          UPDATE safety.dot_inspections
          SET inspection_pdf_url = $2
          WHERE id = $1
            AND operating_company_id = $3::uuid
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
        { dot_inspection_id: row.id, operating_company_id: query.data.operating_company_id, inspection_pdf_url: pdfUrl },
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
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const updated = await client.query(
        `
          UPDATE safety.dot_inspections
          SET voided_at = now(), voided_by = $2, void_reason = $4
          WHERE id = $1
            AND operating_company_id = $3::uuid
            AND voided_at IS NULL
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id, body.data.void_reason]
      );
      const row = updated.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.dot_inspection.voided",
        { dot_inspection_id: row.id, operating_company_id: query.data.operating_company_id, void_reason: body.data.void_reason },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });
    if (!payload) return reply.code(404).send({ error: "dot_inspection_not_found" });
    return { dot_inspection: payload };
  });
}
