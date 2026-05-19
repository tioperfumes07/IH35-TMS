import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  within_hours: z.coerce.number().int().min(1).max(168).default(48),
  include_already_arrived: z.coerce.boolean().default(true),
  include_non_yard_destination: z.coerce.boolean().default(true),
  severity_min: z.enum(["info", "warning", "severe"]).default("info"),
});

const loadParamsSchema = z.object({
  load_id: z.string().uuid(),
});

const convertIssueBodySchema = z.object({
  issue_id: z.string().uuid(),
  wo_source_type: z.enum(["IS", "ES", "AC", "ET", "RT", "IT", "RS"]),
  additional_notes: z.string().trim().max(2000).optional(),
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

function canConvert(role: string) {
  return ["Owner", "Administrator", "Manager", "Maintenance"].includes(role);
}

function suggestedWoSourceType(issues: Array<{ issue_type?: string; severity?: string }>): "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS" {
  const text = issues.map((issue) => String(issue.issue_type ?? "").toLowerCase()).join(" ");
  if (text.includes("accident") || text.includes("collision") || text.includes("crash")) return "AC";
  if (text.includes("roadside")) return "RS";
  if (text.includes("tire")) return text.includes("roadside") ? "RT" : "IT";
  if (text.includes("external")) return "ES";
  return "IS";
}

export async function registerMaintenanceArrivingSoonRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/arriving-soon", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const filters = [`operating_company_id = $1`];

      if (!q.include_already_arrived) {
        filters.push("already_arrived = false");
      }
      if (!q.include_non_yard_destination) {
        filters.push("final_dest_is_yard = true");
      }
      if (q.within_hours > 0) {
        values.push(q.within_hours);
        filters.push(`(predicted_yard_arrival_at IS NULL OR predicted_yard_arrival_at <= now() + ($${values.length}::text || ' hours')::interval)`);
      }
      if (q.severity_min === "warning") {
        filters.push("(severe_count > 0 OR warning_count > 0)");
      } else if (q.severity_min === "severe") {
        filters.push("severe_count > 0");
      }

      const whereSql = `WHERE ${filters.join(" AND ")}`;
      const res = await client.query(
        `
          SELECT *
          FROM maintenance.v_arriving_soon
          ${whereSql}
          ORDER BY
            COALESCE(predicted_yard_arrival_at, now() + interval '999 days') ASC,
            severe_count DESC,
            warning_count DESC
          LIMIT 300
        `,
        values
      );

      const cards = res.rows.map((row: Record<string, unknown>) => {
        const issues = (Array.isArray(row.issues_json) ? row.issues_json : []) as Array<{ issue_type?: string; severity?: string }>;
        return {
        load_id: row.load_id,
        load_display_id: row.load_display_id,
        load_status: row.load_status,
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        driver_id: row.driver_id,
        driver_name: row.driver_name,
        final_dest_name: row.final_dest_name,
        final_dest_city: row.final_dest_city,
        final_dest_state: row.final_dest_state,
        final_dest_is_yard: Boolean(row.final_dest_is_yard),
        predicted_yard_arrival_at: row.predicted_yard_arrival_at,
        hours_until_yard_arrival: row.hours_until_yard_arrival,
        already_arrived: Boolean(row.already_arrived),
        eta_confidence: row.eta_confidence,
        issues,
        severe_count: Number(row.severe_count ?? 0),
        warning_count: Number(row.warning_count ?? 0),
        info_count: Number(row.info_count ?? 0),
        total_open_issues: Number(row.total_open_issues ?? 0),
        suggested_wo_source_type: suggestedWoSourceType(issues),
      };
      });

      const counts = {
        total: cards.length,
        severe: cards.filter((row: any) => Number(row.severe_count) > 0).length,
        warning: cards.filter((row: any) => Number(row.warning_count) > 0).length,
        info: cards.filter((row: any) => Number(row.info_count) > 0).length,
        already_arrived: cards.filter((row: any) => row.already_arrived).length,
        within_24h: cards.filter((row: any) => typeof row.hours_until_yard_arrival === "number" && Number(row.hours_until_yard_arrival) <= 24).length,
        within_48h: cards.filter((row: any) => typeof row.hours_until_yard_arrival === "number" && Number(row.hours_until_yard_arrival) <= 48).length,
      };

      return { cards, counts };
    });

    return payload;
  });

  app.post("/api/v1/maintenance/arriving-soon/:load_id/convert-issue-to-wo", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canConvert(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = loadParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = convertIssueBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;
    const result = await withCompany(user.uuid, companyId, async (client) => {
      const loadRes = await client.query(
        `
          SELECT id, operating_company_id, assigned_unit_id AS unit_id, assigned_primary_driver_id AS driver_id
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.load_id, companyId]
      );
      const load = loadRes.rows[0];
      if (!load) return { code: 404 as const, error: "load_not_found" };

      const issueRes = await client.query(
        `
          SELECT *
          FROM dispatch.intransit_issues
          WHERE id = $1
            AND unit_id = $2
            AND promoted_to_wo_id IS NULL
            AND promoted_to_damage_report_id IS NULL
          LIMIT 1
        `,
        [body.data.issue_id, load.unit_id]
      );
      const issue = issueRes.rows[0];
      if (!issue) return { code: 404 as const, error: "issue_not_found_or_already_converted" };

      const displayRes = await client.query(
        `
          SELECT display_id, sequence
          FROM maintenance.next_wo_display_id($1, $2, CURRENT_DATE, $3)
        `,
        [load.unit_id, body.data.wo_source_type, companyId]
      );
      const display = displayRes.rows[0];
      const displayId = String(display?.display_id ?? "");
      const unitSequence = Number(display?.sequence ?? 0);

      const description = `${String(issue.issue_description ?? "").trim()} (auto from in-transit issue ${issue.id})${body.data.additional_notes ? `\n${body.data.additional_notes}` : ""}`.trim();

      const woRes = await client.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id,
            wo_type,
            source_type,
            unit_id,
            driver_id,
            load_id,
            description,
            status,
            opened_at,
            display_id,
            unit_sequence,
            repair_location
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'open',
            now(),
            $8,
            $9,
            'mobile_roadside'
          )
          RETURNING *
        `,
        [
          companyId,
          body.data.wo_source_type === "AC" ? "accident" : body.data.wo_source_type === "IT" || body.data.wo_source_type === "ET" || body.data.wo_source_type === "RT" ? "tire" : "repair",
          body.data.wo_source_type,
          load.unit_id,
          load.driver_id ?? null,
          load.id,
          description,
          displayId || null,
          unitSequence > 0 ? unitSequence : null,
        ]
      );
      const wo = woRes.rows[0];

      const statusColumnRes = await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'dispatch'
              AND table_name = 'intransit_issues'
              AND column_name = 'status'
          ) AS ok
        `
      );
      if (Boolean(statusColumnRes.rows[0]?.ok)) {
        await client.query(
          `
            UPDATE dispatch.intransit_issues
            SET promoted_to_wo_id = $2,
                status = 'converted'
            WHERE id = $1
          `,
          [body.data.issue_id, wo.id]
        );
      } else {
        await client.query(
          `
            UPDATE dispatch.intransit_issues
            SET promoted_to_wo_id = $2
            WHERE id = $1
          `,
          [body.data.issue_id, wo.id]
        );
      }

      let unitBlocked = false;
      if (String(issue.severity ?? "") === "severe") {
        await client.query(
          `
            UPDATE mdata.units
            SET
              is_dispatch_blocked = true,
              dispatch_block_reason = 'Auto-blocked from severe in-transit issue conversion',
              dispatch_block_source_uuid = $2,
              dispatch_block_source_type = 'maintenance_arriving_soon',
              updated_at = now()
            WHERE id = $1
          `,
          [load.unit_id, wo.id]
        );
        unitBlocked = true;
        await appendCrudAudit(
          client,
          user.uuid,
          "dispatch.unit.dispatch_blocked",
          {
            resource_type: "mdata.units",
            resource_id: load.unit_id,
            source_issue_id: issue.id,
            source_work_order_id: wo.id,
            operating_company_id: companyId,
          },
          "warning",
          "P3-T11.6.2-ARRIVING-SOON"
        );
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo_display_id_generated",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          display_id: wo.display_id,
          unit_sequence: wo.unit_sequence,
          operating_company_id: companyId,
        },
        "info",
        "P3-T11.6.2-ARRIVING-SOON"
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.arriving_soon.converted_to_wo",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          source_issue_id: issue.id,
          source_load_id: load.id,
          operating_company_id: companyId,
        },
        "info",
        "P3-T11.6.2-ARRIVING-SOON"
      );

      return {
        code: 201 as const,
        data: {
          wo,
          issue_updated: {
            id: issue.id,
            promoted_to_wo_id: wo.id,
            status: "converted",
          },
          unit_blocked: unitBlocked,
        },
      };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  app.post("/api/v1/maintenance/arriving-soon/audit-view", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.arriving_soon.viewed",
        {
          resource_type: "maintenance.arriving_soon",
          resource_id: parsed.data.operating_company_id,
          user_id: user.uuid,
          operating_company_id: parsed.data.operating_company_id,
          ts: new Date().toISOString(),
        },
        "info",
        "P3-T11.6.2-ARRIVING-SOON"
      );
    });

    return { ok: true };
  });
}
