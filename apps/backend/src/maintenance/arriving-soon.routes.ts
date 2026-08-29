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
  within_hours: z.coerce.number().int().min(1).max(168).default(48),
  include_already_arrived: z.coerce.boolean().default(true),
  include_non_yard_destination: z.coerce.boolean().default(true),
  severity_min: z.enum(["info", "warning", "severe"]).default("info"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  recent_limit: z.coerce.number().int().min(1).max(100).default(12),
  recent_offset: z.coerce.number().int().min(0).default(0),
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
  if (!requireAuth(req, reply)) return reply;
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
  app.get("/api/v1/maintenance/arriving-soon", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const filters = [`operating_company_id = $1::uuid`];

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
      values.push(q.limit, q.offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;
      const res = await client.query(
        `
          SELECT *
          FROM maintenance.v_arriving_soon
          ${whereSql}
          ORDER BY
            COALESCE(predicted_yard_arrival_at, now() + interval '999 days') ASC,
            severe_count DESC,
            warning_count DESC,
            load_id ASC,
            unit_id ASC
          LIMIT $${limitParam}
          OFFSET $${offsetParam}
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

      const countValues = values.slice(0, -2);
      const countRes = await client.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE severe_count > 0)::int AS severe,
           COUNT(*) FILTER (WHERE warning_count > 0)::int AS warning,
           COUNT(*) FILTER (WHERE info_count > 0)::int AS info,
           COUNT(*) FILTER (WHERE already_arrived)::int AS already_arrived,
           COUNT(*) FILTER (WHERE hours_until_yard_arrival <= 24)::int AS within_24h,
           COUNT(*) FILTER (WHERE hours_until_yard_arrival <= 48)::int AS within_48h
         FROM maintenance.v_arriving_soon
         ${whereSql}`,
        countValues
      );
      const counts = countRes.rows[0] ?? { total: 0, severe: 0, warning: 0, info: 0, already_arrived: 0, within_24h: 0, within_48h: 0 };

      // Converted issues leave v_arriving_soon by design. Keep their persisted
      // issue -> WO reverse edge visible on this source surface instead of
      // losing the operator's newly-created record after the queue refresh.
      const convertedRes = await client.query(
        `
          SELECT
            ii.id AS issue_id,
            ii.issue_type,
            ii.issue_category,
            ii.issue_description,
            ii.severity,
            wo.opened_at AS converted_at,
            wo.id AS work_order_id,
            wo.display_id AS work_order_display_id,
            wo.load_id,
            COALESCE(l.load_number, wo.load_id::text) AS load_display_id,
            wo.unit_id,
            COALESCE(u.unit_number, wo.unit_id::text) AS unit_number
          FROM dispatch.intransit_issues ii
          JOIN maintenance.work_orders wo
            ON wo.id = ii.promoted_to_wo_id
           AND wo.operating_company_id = $1::uuid
          LEFT JOIN mdata.loads l
            ON l.id = wo.load_id
           AND l.operating_company_id = wo.operating_company_id
          LEFT JOIN mdata.units u
            ON u.id = wo.unit_id
           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
          WHERE ii.promoted_to_wo_id IS NOT NULL
            AND wo.opened_at >= now() - interval '7 days'
          ORDER BY wo.opened_at DESC, ii.id DESC
          LIMIT $2 OFFSET $3
        `,
        [q.operating_company_id, q.recent_limit, q.recent_offset]
      );

      const convertedCountRes = await client.query(
        `SELECT COUNT(*)::int AS total_count
         FROM dispatch.intransit_issues ii
         JOIN maintenance.work_orders wo
           ON wo.id = ii.promoted_to_wo_id
          AND wo.operating_company_id = $1::uuid
         WHERE ii.promoted_to_wo_id IS NOT NULL
           AND wo.opened_at >= now() - interval '7 days'`,
        [q.operating_company_id]
      );

      return {
        cards,
        counts,
        recent_conversions: convertedRes.rows,
        recent_conversions_total_count: Number(convertedCountRes.rows[0]?.total_count ?? 0),
        recent_conversions_limit: q.recent_limit,
        recent_conversions_offset: q.recent_offset,
      };
    });

    return payload;
  });

  app.post(
    "/api/v1/maintenance/arriving-soon/:load_id/convert-issue-to-wo",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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
            AND operating_company_id = $2::uuid
            AND unit_id = $3
            AND promoted_to_wo_id IS NULL
            AND promoted_to_damage_report_id IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [body.data.issue_id, companyId, load.unit_id]
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

      // MNT-LINK-03b: write reverse FK when column is live (owner Neon-applied); skip until then.
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
            repair_location,
            source_intransit_issue_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, 'open', now(), $8, $9, 'mobile_roadside', $10
          )
          RETURNING *
        `
          : `
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
            $1, $2, $3, $4, $5, $6, $7, 'open', now(), $8, $9, 'mobile_roadside'
          )
          RETURNING *
        `,
        hasReverseCol
          ? [
              companyId,
              body.data.wo_source_type === "AC" ? "accident" : body.data.wo_source_type === "IT" || body.data.wo_source_type === "ET" || body.data.wo_source_type === "RT" ? "tire" : "repair",
              body.data.wo_source_type,
              load.unit_id,
              load.driver_id ?? null,
              load.id,
              description,
              displayId || null,
              unitSequence > 0 ? unitSequence : null,
              body.data.issue_id,
            ]
          : [
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
      if (!wo?.id) throw new Error("arriving_soon_work_order_insert_failed");

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
        const linked = await client.query(
          `
            UPDATE dispatch.intransit_issues
            SET promoted_to_wo_id = $2,
                status = 'converted'
            WHERE id = $1
              AND operating_company_id = $3::uuid
              AND promoted_to_wo_id IS NULL
              AND promoted_to_damage_report_id IS NULL
            RETURNING id::text
          `,
          [body.data.issue_id, wo.id, companyId]
        );
        if (!linked.rows[0]) throw new Error("arriving_soon_issue_link_lost");
      } else {
        const linked = await client.query(
          `
            UPDATE dispatch.intransit_issues
            SET promoted_to_wo_id = $2
            WHERE id = $1
              AND operating_company_id = $3::uuid
              AND promoted_to_wo_id IS NULL
              AND promoted_to_damage_report_id IS NULL
            RETURNING id::text
          `,
          [body.data.issue_id, wo.id, companyId]
        );
        if (!linked.rows[0]) throw new Error("arriving_soon_issue_link_lost");
      }

      let unitBlocked = false;
      if (String(issue.severity ?? "") === "severe") {
        const blocked = await client.query(
          `
            UPDATE mdata.units AS u
            SET
              is_dispatch_blocked = true,
              dispatch_block_reason = 'Auto-blocked from severe in-transit issue conversion',
              dispatch_block_source_uuid = $2,
              dispatch_block_source_type = 'maintenance_arriving_soon',
              updated_at = now()
            WHERE u.id = $1
              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $4::uuid
              AND EXISTS (
                SELECT 1
                FROM mdata.loads l
                WHERE l.id = $3::uuid
                  AND l.operating_company_id = $4::uuid
                  AND l.assigned_unit_id = u.id
                  AND l.soft_deleted_at IS NULL
              )
            RETURNING id::text
          `,
          [load.unit_id, wo.id, load.id, companyId]
        );
        if (!blocked.rows[0]) throw new Error("arriving_soon_unit_block_lost");
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
    }
  );

  app.post("/api/v1/maintenance/arriving-soon/audit-view", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
