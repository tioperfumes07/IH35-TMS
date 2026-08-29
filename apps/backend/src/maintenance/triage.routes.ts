import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const issueParamsSchema = z.object({ issue_id: z.string().uuid() });
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const convertToWoBodySchema = z.object({
  wo_type: z.enum(["pm", "repair", "tire", "accident"]).default("repair"),
  additional_notes: z.string().trim().max(1000).optional(),
});
const convertToDamageBodySchema = z.object({
  damage_category: z.string().trim().max(120),
  additional_notes: z.string().trim().max(1000).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

async function relationExists(client: any, rel: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

export async function registerMaintenanceTriageRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/maintenance/triage/:issue_id/convert-to-wo",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = issueParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = convertToWoBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "dispatch.intransit_issues")) || !(await relationExists(client, "maintenance.work_orders"))) {
        return { unavailable: true as const };
      }

      const issueRes = await client.query(
        `
          SELECT *
          FROM dispatch.intransit_issues
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND promoted_to_wo_id IS NULL
            AND promoted_to_damage_report_id IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [params.data.issue_id, query.data.operating_company_id]
      );
      const issue = issueRes.rows[0];
      if (!issue) return { notFound: true as const };

      const displayIdRes = await client.query(
        `
          SELECT display_id, sequence
          FROM maintenance.next_wo_display_id($1, 'IT', CURRENT_DATE, $2)
        `,
        [issue.unit_id, query.data.operating_company_id]
      );
      const display = displayIdRes.rows[0];

      const reverseColRes = await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'maintenance'
              AND table_name = 'work_orders'
              AND column_name = 'source_intransit_issue_id'
          ) AS ok
        `
      );
      const hasReverseCol = Boolean((reverseColRes.rows[0] as { ok?: boolean } | undefined)?.ok);

      const woRes = await client.query(
        hasReverseCol
          ? `
          INSERT INTO maintenance.work_orders (
            operating_company_id, wo_type, source_type, status, unit_id, driver_id, load_id, opened_at, repair_location, description, display_id, unit_sequence, source_intransit_issue_id
          )
          VALUES ($1,$2,'IT','open',$3,$4,$5,now(),'mobile_roadside',$6,$7,$8,$9)
          RETURNING id
        `
          : `
          INSERT INTO maintenance.work_orders (
            operating_company_id, wo_type, source_type, status, unit_id, driver_id, load_id, opened_at, repair_location, description, display_id, unit_sequence
          )
          VALUES ($1,$2,'IT','open',$3,$4,$5,now(),'mobile_roadside',$6,$7,$8)
          RETURNING id
        `,
        hasReverseCol
          ? [
              query.data.operating_company_id,
              body.data.wo_type,
              issue.unit_id,
              issue.driver_id,
              issue.load_id,
              `${issue.issue_description ?? ""}\n${body.data.additional_notes ?? ""}\nGPS: ${issue.gps_lat ?? ""},${issue.gps_lng ?? ""} ${issue.gps_label ?? ""}`.trim(),
              display?.display_id ?? null,
              Number(display?.sequence ?? 0) || null,
              params.data.issue_id,
            ]
          : [
              query.data.operating_company_id,
              body.data.wo_type,
              issue.unit_id,
              issue.driver_id,
              issue.load_id,
              `${issue.issue_description ?? ""}\n${body.data.additional_notes ?? ""}\nGPS: ${issue.gps_lat ?? ""},${issue.gps_lng ?? ""} ${issue.gps_label ?? ""}`.trim(),
              display?.display_id ?? null,
              Number(display?.sequence ?? 0) || null,
            ]
      );
      const workOrderId = String(woRes.rows[0]?.id ?? "");
      if (!workOrderId) throw new Error("triage_work_order_insert_failed");

      const linked = await client.query(
        `UPDATE dispatch.intransit_issues
         SET promoted_to_wo_id = $2
         WHERE id = $1
           AND operating_company_id = $3::uuid
           AND promoted_to_wo_id IS NULL
           AND promoted_to_damage_report_id IS NULL
         RETURNING id::text`,
        [params.data.issue_id, workOrderId, query.data.operating_company_id]
      );
      if (!linked.rows[0]) throw new Error("triage_work_order_link_lost");

      // ONE event, not one per recipient. The previous code emitted three near-identical events
      // differing only by notify_target; the consumer resolves the audience by role, so fanning out
      // here would deliver every notification three times to every recipient.
      await enqueueOutboxEvent(
        client,
        "maintenance.triage.converted_to_wo",
        { aggregate_type: "dispatch.intransit_issues", aggregate_id: params.data.issue_id },
        {
          issue_id: params.data.issue_id,
          work_order_id: workOrderId,
          operating_company_id: query.data.operating_company_id,
        }
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.work_order.created",
        {
          operating_company_id: query.data.operating_company_id,
          resource_type: "maintenance.work_orders",
          resource_id: workOrderId,
          source_issue_id: params.data.issue_id,
          conversion: "intransit_to_wo",
        },
        "info",
        "BT-3-MAINTENANCE-REBUILD"
      );

      return { unavailable: false as const, work_order_id: workOrderId };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "maintenance_or_intransit_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "intransit_issue_not_found_or_already_promoted" });
    return reply.code(201).send(result);
    }
  );

  app.post(
    "/api/v1/maintenance/triage/:issue_id/convert-to-damage",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = issueParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = convertToDamageBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    // In-transit issue -> formal damage register (safety.incidents). This reuses the existing
    // damage-report register exactly like convert-to-wo reuses maintenance.work_orders — it is a
    // safety/maintenance record, NOT a GL/financial posting (damage_amount_cents defaults to 0 and
    // is owner-edited later in the register). Mirror of the convert-to-wo flow above (QA-sweep).
    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "dispatch.intransit_issues")) || !(await relationExists(client, "safety.incidents"))) {
        return { unavailable: true as const };
      }

      const issueRes = await client.query(
        `
          SELECT *
          FROM dispatch.intransit_issues
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND promoted_to_wo_id IS NULL
            AND promoted_to_damage_report_id IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [params.data.issue_id, query.data.operating_company_id]
      );
      const issue = issueRes.rows[0];
      if (!issue) return { notFound: true as const };

      const description = [
        issue.issue_description ?? "",
        body.data.additional_notes ?? "",
        `Damage category: ${body.data.damage_category}`,
        `Converted from in-transit issue ${params.data.issue_id}`,
      ]
        .filter((part) => String(part).trim().length > 0)
        .join("\n")
        .trim();

      const incidentRes = await client.query(
        `
          INSERT INTO safety.incidents (
            operating_company_id, incident_type, status, location, description,
            driver_id, unit_id, load_id, photo_keys
          )
          VALUES ($1, 'damage_report', 'open', $2, $3, $4, $5, $6, (COALESCE($7::text[], '{}'::text[]))[1:10])
          RETURNING id
        `,
        [
          query.data.operating_company_id,
          issue.gps_label ?? "",
          description,
          issue.driver_id ?? null,
          issue.unit_id ?? null,
          issue.load_id ?? null,
          issue.photo_keys ?? null,
        ]
      );
      const damageReportId = String(incidentRes.rows[0]?.id ?? "");
      if (!damageReportId) throw new Error("triage_damage_report_insert_failed");

      const linked = await client.query(
        `UPDATE dispatch.intransit_issues
         SET promoted_to_damage_report_id = $2
         WHERE id = $1
           AND operating_company_id = $3::uuid
           AND promoted_to_wo_id IS NULL
           AND promoted_to_damage_report_id IS NULL
         RETURNING id::text`,
        [params.data.issue_id, damageReportId, query.data.operating_company_id]
      );
      if (!linked.rows[0]) throw new Error("triage_damage_report_link_lost");

      // ONE event, not one per recipient — see the converted_to_wo path above.
      await enqueueOutboxEvent(
        client,
        "maintenance.triage.converted_to_damage",
        { aggregate_type: "dispatch.intransit_issues", aggregate_id: params.data.issue_id },
        {
          issue_id: params.data.issue_id,
          damage_report_id: damageReportId,
          operating_company_id: query.data.operating_company_id,
        }
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.created",
        {
          operating_company_id: query.data.operating_company_id,
          resource_type: "safety.incidents",
          resource_id: damageReportId,
          source_issue_id: params.data.issue_id,
          conversion: "intransit_to_damage",
        },
        "info",
        "BT-3-MAINTENANCE-REBUILD"
      );

      return { unavailable: false as const, damage_report_id: damageReportId };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "safety_or_intransit_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "intransit_issue_not_found_or_already_promoted" });
    return reply.code(201).send(result);
    }
  );
}
