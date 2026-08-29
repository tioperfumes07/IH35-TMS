import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["pending", "assigned", "escalated", "converted", "closed", "all"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailQuerySchema = companyQuerySchema.extend({
  history_limit: z.coerce.number().int().min(1).max(200).default(50),
  history_offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const triageBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  action: z.enum(["assign", "escalate", "close_no_action", "convert_to_wo"]),
  assignee_note: z.string().trim().max(2000).optional(),
  mechanic_notes: z.string().trim().max(4000).optional(),
  wo_type: z.enum(["pm", "repair", "tire", "accident"]).default("repair"),
});

const TRIAGE_EVENT_PREFIX = "maintenance.dvir_defect.";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

function triageStatusFromRow(row: Record<string, unknown>): string {
  if (row.follow_up_wo_id) return "converted";
  const eventClass = String(row.latest_triage_event ?? "");
  if (eventClass.endsWith(".assigned")) return "assigned";
  if (eventClass.endsWith(".escalated")) return "escalated";
  if (eventClass.endsWith(".closed_no_action")) return "closed";
  if (eventClass.endsWith(".converted_to_wo")) return "converted";
  return "pending";
}

export async function registerMaintenanceDefectsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/dvir-defects", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            dd.id,
            dd.dvir_submission_id,
            dd.unit_id,
            dd.item_key,
            dd.severity,
            dd.notes,
            dd.photo_keys,
            dd.follow_up_wo_id,
            dd.created_at,
            ds.type AS dvir_type,
            ds.submitted_at,
            ds.driver_id,
            ds.load_id,
            TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name,
            u.unit_number,
            wo.display_id AS follow_up_wo_display_id,
            triage.latest_triage_event
          FROM safety.dvir_defects dd
          INNER JOIN safety.dvir_submissions ds ON ds.id = dd.dvir_submission_id
          LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
                                   AND (
                                     d.operating_company_id = ds.operating_company_id
                                     OR EXISTS (
                                       SELECT 1 FROM mdata.driver_company_authorizations defects_list_dca
                                       WHERE defects_list_dca.driver_id = d.id
                                         AND defects_list_dca.company_id = ds.operating_company_id
                                         AND defects_list_dca.is_authorized = true
                                         AND defects_list_dca.deactivated_at IS NULL
                                     )
                                   )
          LEFT JOIN mdata.units u ON u.id = dd.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = dd.operating_company_id
          LEFT JOIN maintenance.work_orders wo ON wo.id = dd.follow_up_wo_id
                                               AND wo.operating_company_id = dd.operating_company_id
          LEFT JOIN LATERAL (
            SELECT ae.event_class AS latest_triage_event
            FROM audit.audit_events ae
            WHERE ae.payload->>'resource_id' = dd.id::text
              AND ae.event_class LIKE '${TRIAGE_EVENT_PREFIX}%'
            ORDER BY ae.created_at DESC
            LIMIT 1
          ) triage ON true
          WHERE dd.operating_company_id = $1::uuid
            AND dd.resolved_at IS NULL
          ORDER BY ds.submitted_at DESC, dd.created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [query.data.operating_company_id, query.data.limit, query.data.offset]
      );

      return res.rows
        .map((row) => ({ ...row, triage_status: triageStatusFromRow(row) }))
        .filter((row) => query.data.status === "all" || row.triage_status === query.data.status);
    });

    return { defects: rows };
  });

  app.get("/api/v1/maintenance/dvir-defects/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = detailQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const defectRes = await client.query(
        `
          SELECT
            dd.*,
            ds.type AS dvir_type,
            ds.submitted_at,
            ds.odometer,
            ds.location,
            ds.driver_id,
            ds.load_id,
            TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name,
            u.unit_number,
            wo.display_id AS follow_up_wo_display_id
          FROM safety.dvir_defects dd
          INNER JOIN safety.dvir_submissions ds ON ds.id = dd.dvir_submission_id
          LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
                                   AND (
                                     d.operating_company_id = ds.operating_company_id
                                     OR EXISTS (
                                       SELECT 1 FROM mdata.driver_company_authorizations defects_detail_dca
                                       WHERE defects_detail_dca.driver_id = d.id
                                         AND defects_detail_dca.company_id = ds.operating_company_id
                                         AND defects_detail_dca.is_authorized = true
                                         AND defects_detail_dca.deactivated_at IS NULL
                                     )
                                   )
          LEFT JOIN mdata.units u ON u.id = dd.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = dd.operating_company_id
          LEFT JOIN maintenance.work_orders wo ON wo.id = dd.follow_up_wo_id
                                               AND wo.operating_company_id = dd.operating_company_id
          WHERE dd.id = $1
            AND dd.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const defect = defectRes.rows[0];
      if (!defect) return null;

      const historyCountRes = await client.query(
        `SELECT count(*)::int AS total_count
           FROM audit.audit_events
          WHERE payload->>'resource_id' = $1
            AND event_class LIKE $2`,
        [params.data.id, `${TRIAGE_EVENT_PREFIX}%`]
      );
      const historyRes = await client.query(
        `
          SELECT event_class, created_at, payload
          FROM audit.audit_events
          WHERE payload->>'resource_id' = $1
            AND event_class LIKE $2
          ORDER BY created_at DESC
          LIMIT $3::int OFFSET $4::int
        `,
        [params.data.id, `${TRIAGE_EVENT_PREFIX}%`, query.data.history_limit, query.data.history_offset]
      );

      return {
        defect: { ...defect, triage_status: triageStatusFromRow(defect) },
        triage_history: historyRes.rows,
        triage_history_total: Number(historyCountRes.rows[0]?.total_count ?? 0),
      };
    });

    if (!payload) return reply.code(404).send({ error: "defect_not_found" });
    return payload;
  });

  app.post("/api/v1/maintenance/dvir-defects/:id/triage", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = triageBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
      const defectRes = await client.query(
        `
          SELECT dd.*, ds.driver_id, ds.type AS dvir_type
          FROM safety.dvir_defects dd
          INNER JOIN safety.dvir_submissions ds ON ds.id = dd.dvir_submission_id
          WHERE dd.id = $1
            AND dd.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      );
      const defect = defectRes.rows[0];
      if (!defect) return { notFound: true as const };

      const auditBase = {
        resource_type: "safety.dvir_defects",
        resource_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
        dvir_submission_id: defect.dvir_submission_id,
        unit_id: defect.unit_id,
        item_key: defect.item_key,
        assignee_note: body.data.assignee_note ?? null,
        mechanic_notes: body.data.mechanic_notes ?? null,
      };

      if (body.data.action === "assign") {
        await appendCrudAudit(client, user.uuid, `${TRIAGE_EVENT_PREFIX}assigned`, auditBase);
        return { triage_status: "assigned" as const };
      }

      if (body.data.action === "escalate") {
        await appendCrudAudit(client, user.uuid, `${TRIAGE_EVENT_PREFIX}escalated`, auditBase, "warning");
        return { triage_status: "escalated" as const };
      }

      if (body.data.action === "close_no_action") {
        await appendCrudAudit(client, user.uuid, `${TRIAGE_EVENT_PREFIX}closed_no_action`, auditBase);
        return { triage_status: "closed" as const };
      }

      const lockedDefectRes = await client.query(
        `SELECT dd.follow_up_wo_id::text
           FROM safety.dvir_defects dd
          WHERE dd.id = $1
            AND dd.operating_company_id = $2::uuid
          FOR UPDATE OF dd`,
        [params.data.id, body.data.operating_company_id]
      );
      const lockedDefect = lockedDefectRes.rows[0];
      if (!lockedDefect) return { notFound: true as const };
      if (lockedDefect.follow_up_wo_id) {
        return { alreadyConverted: true as const, work_order_id: lockedDefect.follow_up_wo_id };
      }

      // source_type must be in chk_maintenance_wo_source_type + next_wo_display_id allowlist
      // (IS|ES|AC|ET|RT|IT|RS). DVIR triage creates an in-house repair → Internal Shop (IS).
      // Do NOT invent 'DV' — it fails both the CHECK and next_wo_display_id.
      const woSourceType = "IS";
      const displayIdRes = await client.query(
        `
          SELECT display_id, sequence
          FROM maintenance.next_wo_display_id($1, $2, CURRENT_DATE, $3)
        `,
        [defect.unit_id, woSourceType, body.data.operating_company_id]
      );
      const display = displayIdRes.rows[0];
      const description = [
        `DVIR defect triage — ${String(defect.item_key)} (${String(defect.severity)})`,
        defect.notes ? `Driver notes: ${String(defect.notes)}` : "",
        body.data.mechanic_notes ? `Mechanic: ${body.data.mechanic_notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const woRes = await client.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id,
            wo_type,
            source_type,
            status,
            unit_id,
            driver_id,
            opened_at,
            repair_location,
            description,
            display_id,
            unit_sequence,
            origin,
            wo_title
          )
          VALUES ($1,$2,$3,'open',$4,$5,now(),'in_house',$6,$7,$8,'dvir',$9)
          RETURNING id, display_id
        `,
        [
          body.data.operating_company_id,
          body.data.wo_type,
          woSourceType,
          defect.unit_id,
          defect.driver_id ?? null,
          description,
          display?.display_id ?? null,
          Number(display?.sequence ?? 0) || null,
          `DVIR — ${String(defect.item_key)}`,
        ]
      );
      const workOrderId = woRes.rows[0]?.id;
      if (!workOrderId) return { failed: true as const };

      // Per-defect linkage (alreadyConverted gates on dd.follow_up_wo_id). Submissions-level
      // UPDATE was the wrong table — one submission can have many defects.
      const linked = await client.query(
        `
          UPDATE safety.dvir_defects
          SET follow_up_wo_id = $2
          WHERE id = $1
            AND operating_company_id = $3::uuid
            AND follow_up_wo_id IS NULL
          RETURNING id::text
        `,
        [params.data.id, workOrderId, body.data.operating_company_id]
      );
      if (!linked.rows[0]) throw new Error("dvir_defect_follow_up_link_lost");

      await appendCrudAudit(client, user.uuid, `${TRIAGE_EVENT_PREFIX}converted_to_wo`, {
        ...auditBase,
        work_order_id: workOrderId,
      });

      return { triage_status: "converted" as const, work_order_id: workOrderId, display_id: woRes.rows[0]?.display_id ?? null };
    });

    if ("notFound" in result && result.notFound) return reply.code(404).send({ error: "defect_not_found" });
    if ("failed" in result && result.failed) return reply.code(500).send({ error: "wo_create_failed" });
    return result;
  });
}
