/**
 * pre-flight-dvir.routes.ts — /api/v1/maintenance/pre-flight-dvir/*
 *
 * G10-H3 contract build. The Pre-Flight DVIR Queue UI
 * (apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx via
 * apps/frontend/src/api/maintenance.ts) calls three routes that were never built (404 → the queue
 * rendered empty / actions failed):
 *
 *   GET   /api/v1/maintenance/pre-flight-dvir/queue          → list DVIR defects w/ effective severity + routing status
 *   POST  /api/v1/maintenance/pre-flight-dvir/:defectId/route → route a defect (major→WO, minor→next-PM, obs→log)
 *   PATCH /api/v1/maintenance/pre-flight-dvir/:defectId/severity → re-tag defect severity (append-only)
 *
 * NON-FINANCIAL (safety/maintenance — no money, no GL). Real tables (verified vs db/migrations):
 *   - safety.dvir_defects (0344, APPEND-ONLY: UPDATE/DELETE blocked) — the canonical defect row
 *   - safety.dvir_submissions (0344) — DVIR header: driver_id, unit_id, submitted_at
 *   - safety.dvir_defect_severity_tags (202606071700, APPEND-ONLY) — severity + routing history;
 *       effective state = most-recent row (created_at DESC). Because dvir_defects is append-only,
 *       severity overrides AND routing state are recorded as NEW tag rows here, never in-place UPDATEs.
 *   - maintenance.work_orders (+ maintenance.next_wo_display_id) — reused exactly as the shipped
 *       DTC auto-WO path (telematics/dtc-auto-work-order.service.ts) creates them.
 *
 * Auth + membership: withCompanyScope asserts org membership (403) and sets app.operating_company_id
 * so RLS scopes every read/write. Every mutation writes a crud-audit event.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const severityEnum = z.enum(["major", "minor", "observation"]);

const queueQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  severity: severityEnum.optional(),
  status: z.enum(["open", "routed", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const defectParamsSchema = z.object({ defectId: z.string().uuid() });
const routeBodySchema = z.object({ operating_company_id: z.string().uuid() });
const severityBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  severity: severityEnum,
});

type QueueRow = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  item_key: string;
  item_label: string | null;
  severity: "major" | "minor" | "observation";
  major_defect_code: string | null;
  notes: string | null;
  submitted_at: string;
  work_order_id: string | null;
  work_order_display_id: string | null;
  auto_wo_id: string | null;
  routed: boolean;
  status: "open" | "routed" | "closed";
};

/** The most-recent severity tag per defect defines its effective severity + routing state. */
const LATEST_TAG_CTE = `
  latest_tag AS (
    SELECT DISTINCT ON (t.dvir_defect_id)
      t.dvir_defect_id,
      t.severity,
      t.major_defect_code,
      t.routed,
      t.auto_wo_id
    FROM safety.dvir_defect_severity_tags t
    WHERE t.operating_company_id = $1::uuid
    ORDER BY t.dvir_defect_id, t.created_at DESC
  )
`;

export async function registerPreFlightDvirRoutes(app: FastifyInstance) {
  // ── GET /queue ──────────────────────────────────────────────────────────────────────────────
  app.get("/api/v1/maintenance/pre-flight-dvir/queue", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = queueQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const { operating_company_id: companyId, severity, status } = query.data;

    return withCompanyScope(user.uuid, companyId, async (client: DbClient) => {
      const res = await client.query<QueueRow>(
        `
        WITH ${LATEST_TAG_CTE},
        base AS (
          SELECT
            d.id::text                                            AS id,
            d.unit_id::text                                       AS unit_id,
            u.unit_number                                         AS unit_number,
            s.driver_id::text                                     AS driver_id,
            NULLIF(TRIM(COALESCE(dr.first_name,'') || ' ' || COALESCE(dr.last_name,'')), '') AS driver_name,
            d.item_key                                            AS item_key,
            COALESCE(lt.severity, d.severity)                     AS severity,
            COALESCE(lt.major_defect_code, d.major_defect_code)   AS major_defect_code,
            NULLIF(d.notes, '')                                   AS notes,
            s.submitted_at::text                                  AS submitted_at,
            -- Keep UUID typed through the outer JOIN (w.id uuid = text was 42883).
            COALESCE(d.follow_up_wo_id, lt.auto_wo_id)            AS work_order_id,
            lt.auto_wo_id                                         AS auto_wo_id,
            (COALESCE(lt.routed, false) OR d.follow_up_wo_id IS NOT NULL) AS routed,
            CASE
              WHEN d.resolved_at IS NOT NULL THEN 'closed'
              WHEN (COALESCE(lt.routed, false) OR d.follow_up_wo_id IS NOT NULL) THEN 'routed'
              ELSE 'open'
            END                                                   AS status,
            d.resolved_at                                         AS resolved_at
          FROM safety.dvir_defects d
          JOIN safety.dvir_submissions s ON s.id = d.dvir_submission_id
          LEFT JOIN mdata.units u        ON u.id = d.unit_id
                                         AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = d.operating_company_id
          LEFT JOIN mdata.drivers dr     ON dr.id = s.driver_id
                                         AND (
                                           dr.operating_company_id = s.operating_company_id
                                           OR EXISTS (
                                             SELECT 1
                                             FROM mdata.driver_company_authorizations preflight_dvir_dca
                                             WHERE preflight_dvir_dca.driver_id = dr.id
                                               AND preflight_dvir_dca.company_id = s.operating_company_id
                                               AND preflight_dvir_dca.is_authorized = true
                                               AND preflight_dvir_dca.deactivated_at IS NULL
                                           )
                                         )
          LEFT JOIN latest_tag lt        ON lt.dvir_defect_id = d.id
          WHERE d.operating_company_id = $1::uuid
        )
        SELECT
          b.id, b.unit_id, b.unit_number, b.driver_id, b.driver_name, b.item_key,
          NULL::text AS item_label,
          b.severity, b.major_defect_code, b.notes, b.submitted_at,
          b.work_order_id::text AS work_order_id,
          w.display_id AS work_order_display_id,
          b.auto_wo_id::text AS auto_wo_id,
          b.routed, b.status,
          COUNT(*) OVER()::int AS total_count
        FROM base b
        LEFT JOIN maintenance.work_orders w ON w.id = b.work_order_id
        WHERE ($2::text IS NULL OR b.severity = $2::text)
          AND ($3::text IS NULL OR b.status = $3::text)
        ORDER BY b.submitted_at DESC
        LIMIT $4
        OFFSET $5
        `,
        [companyId, severity ?? null, status ?? null, query.data.limit, query.data.offset]
      );
      return { defects: res.rows, total_count: Number((res.rows[0] as (QueueRow & { total_count?: number }) | undefined)?.total_count ?? 0) };
    });
  });

  // ── POST /:defectId/route ───────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/maintenance/pre-flight-dvir/:defectId/route",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = defectParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = routeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const companyId = body.data.operating_company_id;
    const defectId = params.data.defectId;

    const result = await withCompanyScope(user.uuid, companyId, async (client: DbClient) => {
      // Serialize routing before reading the latest routed tag or allocating a WO identity. Without
      // this lock, two requests can both observe "not routed", create separate WOs, and append two
      // routed tags for the same defect.
      const lockRes = await client.query<{ id: string }>(
        `SELECT id::text
           FROM safety.dvir_defects
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          FOR UPDATE`,
        [defectId, companyId]
      );
      if (!lockRes.rows[0]) return { code: 404 as const, error: "defect_not_found" };

      const defRes = await client.query<{
        id: string;
        unit_id: string;
        driver_id: string | null;
        severity: string;
        major_defect_code: string | null;
        follow_up_wo_id: string | null;
        tag_severity: string | null;
        tag_routed: boolean | null;
        tag_wo_id: string | null;
      }>(
        `
        WITH ${LATEST_TAG_CTE}
        SELECT
          d.id::text                       AS id,
          d.unit_id::text                  AS unit_id,
          s.driver_id::text                AS driver_id,
          COALESCE(lt.severity, d.severity) AS severity,
          COALESCE(lt.major_defect_code, d.major_defect_code) AS major_defect_code,
          COALESCE(d.follow_up_wo_id, lt.auto_wo_id)::text AS follow_up_wo_id,
          lt.severity                      AS tag_severity,
          lt.routed                        AS tag_routed,
          lt.auto_wo_id::text              AS tag_wo_id
        FROM safety.dvir_defects d
        JOIN safety.dvir_submissions s ON s.id = d.dvir_submission_id
        LEFT JOIN latest_tag lt ON lt.dvir_defect_id = d.id
        WHERE d.id = $2::uuid AND d.operating_company_id = $1::uuid
        LIMIT 1
        `,
        [companyId, defectId]
      );
      const def = defRes.rows[0];
      if (!def) return { code: 404 as const, error: "defect_not_found" };

      const alreadyRouted = Boolean(def.tag_routed) || Boolean(def.follow_up_wo_id);
      if (alreadyRouted) {
        return {
          code: 200 as const,
          data: {
            action: "already_routed" as const,
            work_order_id: def.follow_up_wo_id ?? undefined,
          },
        };
      }

      const severity = def.severity;

      // MAJOR → create a real work order (same path as the shipped DTC auto-WO service).
      if (severity === "major") {
        const disp = await client.query<{ display_id: string; sequence: number }>(
          `SELECT display_id, sequence FROM maintenance.next_wo_display_id($1::uuid, $2, CURRENT_DATE, $3::uuid)`,
          [def.unit_id, "IS", companyId]
        );
        const displayId = disp.rows[0]?.display_id ?? null;
        const sequence = Number(disp.rows[0]?.sequence ?? 0) || null;

        const woRes = await client.query<{ id: string; display_id: string | null }>(
          `
          INSERT INTO maintenance.work_orders (
            operating_company_id, wo_type, source_type, status, unit_id, driver_id, load_id, opened_at,
            repair_location, vendor_id, external_vendor_invoice_number, description,
            external_vendor_id, external_vendor_wo_number,
            display_id, unit_sequence, estimated_cost_cents, total_actual_cost, bucket
          )
          VALUES (
            $1::uuid,'repair','IS','open',$2::uuid,$3::uuid,NULL,now(),
            'in_house',NULL,NULL,$4,
            NULL,NULL,
            $5,$6,NULL,NULL,'in_house'
          )
          RETURNING id::text AS id, display_id
          `,
          [
            companyId,
            def.unit_id,
            def.driver_id,
            `[pre_flight_dvir] Major defect routed from DVIR (defect ${defectId})`,
            displayId,
            sequence,
          ]
        );
        const wo = woRes.rows[0];
        if (!wo?.id) throw new Error("preflight_dvir_work_order_insert_failed");

        await client.query(
          `
          INSERT INTO safety.dvir_defect_severity_tags (
            operating_company_id, dvir_defect_id, severity, major_defect_code,
            source, routed, auto_wo_id, set_by_user_id, reason
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, 'override', true, $5::uuid, $6::uuid, 'pre_flight_dvir_route')
          `,
          [companyId, defectId, severity, def.major_defect_code, wo.id, user.uuid]
        );

        await appendCrudAudit(client, user.uuid, "maintenance.pre_flight_dvir.route", {
          resource_type: "safety.dvir_defects",
          resource_id: defectId,
          operating_company_id: companyId,
          action: "work_order_created",
          work_order_id: wo.id,
        });

        return {
          code: 200 as const,
          data: {
            action: "work_order_created" as const,
            work_order_id: wo.id,
            display_id: wo.display_id ?? null,
          },
        };
      }

      // MINOR → queue for next PM; OBSERVATION → log only. Both recorded as a routed tag (no WO).
      const action = severity === "minor" ? ("queued_next_pm" as const) : ("logged_observation" as const);
      await client.query(
        `
        INSERT INTO safety.dvir_defect_severity_tags (
          operating_company_id, dvir_defect_id, severity, major_defect_code,
          source, routed, auto_wo_id, set_by_user_id, reason
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, 'override', true, NULL, $5::uuid, 'pre_flight_dvir_route')
        `,
        [companyId, defectId, severity, def.major_defect_code, user.uuid]
      );

      await appendCrudAudit(client, user.uuid, "maintenance.pre_flight_dvir.route", {
        resource_type: "safety.dvir_defects",
        resource_id: defectId,
        operating_company_id: companyId,
        action,
      });

      return { code: 200 as const, data: { action } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
    }
  );

  // ── PATCH /:defectId/severity ───────────────────────────────────────────────────────────────
  app.patch("/api/v1/maintenance/pre-flight-dvir/:defectId/severity", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = defectParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = severityBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const companyId = body.data.operating_company_id;
    const defectId = params.data.defectId;
    const severity = body.data.severity;

    const result = await withCompanyScope(user.uuid, companyId, async (client: DbClient) => {
      const defRes = await client.query<{ id: string; major_defect_code: string | null }>(
        `SELECT id::text AS id, major_defect_code
         FROM safety.dvir_defects
         WHERE id = $1::uuid AND operating_company_id = $2::uuid
         LIMIT 1`,
        [defectId, companyId]
      );
      const def = defRes.rows[0];
      if (!def) return { code: 404 as const, error: "defect_not_found" };

      // Append-only override: record a new severity tag; the effective severity is the latest row.
      await client.query(
        `
        INSERT INTO safety.dvir_defect_severity_tags (
          operating_company_id, dvir_defect_id, severity, major_defect_code,
          source, routed, auto_wo_id, set_by_user_id, reason
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, 'override', false, NULL, $5::uuid, 'pre_flight_dvir_severity_override')
        `,
        [companyId, defectId, severity, severity === "major" ? def.major_defect_code : null, user.uuid]
      );

      await appendCrudAudit(client, user.uuid, "maintenance.pre_flight_dvir.severity_override", {
        resource_type: "safety.dvir_defects",
        resource_id: defectId,
        operating_company_id: companyId,
        severity,
      });

      return { code: 200 as const, data: { id: defectId, severity } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });
}
