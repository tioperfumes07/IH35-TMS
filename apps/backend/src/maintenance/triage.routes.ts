import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const issueParamsSchema = z.object({ issue_id: z.string().uuid() });
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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

async function relationExists(client: any, rel: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

export async function registerMaintenanceTriageRoutes(app: FastifyInstance) {
  app.post("/api/v1/maintenance/triage/:issue_id/convert-to-wo", async (req, reply) => {
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
            AND promoted_to_wo_id IS NULL
            AND promoted_to_damage_report_id IS NULL
          LIMIT 1
        `,
        [params.data.issue_id]
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

      const woRes = await client.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id, wo_type, source_type, status, unit_id, driver_id, opened_at, repair_location, description, display_id, unit_sequence
          )
          VALUES ($1,$2,'IT','open',$3,$4,now(),'mobile_roadside',$5,$6,$7)
          RETURNING id
        `,
        [
          query.data.operating_company_id,
          body.data.wo_type,
          issue.unit_id,
          issue.driver_id,
          `${issue.issue_description ?? ""}\n${body.data.additional_notes ?? ""}\nGPS: ${issue.gps_lat ?? ""},${issue.gps_lng ?? ""} ${issue.gps_label ?? ""}`.trim(),
          display?.display_id ?? null,
          Number(display?.sequence ?? 0) || null,
        ]
      );
      const workOrderId = String(woRes.rows[0].id);

      await client.query(`UPDATE dispatch.intransit_issues SET promoted_to_wo_id = $2 WHERE id = $1`, [params.data.issue_id, workOrderId]);

      const notifications = ["dispatcher", "safety", "owner"];
      for (const target of notifications) {
        await client.query(
          `
            INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
            VALUES ($1,$2,$3,$4::jsonb)
          `,
          ["dispatch.intransit_issues", params.data.issue_id, "maintenance.triage.converted_to_wo", JSON.stringify({ issue_id: params.data.issue_id, work_order_id: workOrderId, notify_target: target })]
        );
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.work_order.created",
        {
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
  });

  app.post("/api/v1/maintenance/triage/:issue_id/convert-to-damage", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = issueParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = convertToDamageBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    return reply.code(501).send({
      error: "damage_conversion_not_implemented",
      message: "Damage conversion is a Phase 4 follow-up (tracked: P3-T11.6-FOLLOWUP-1).",
      issue_id: params.data.issue_id,
      damage_category: body.data.damage_category,
      additional_notes: body.data.additional_notes ?? null,
    });
  });
}
