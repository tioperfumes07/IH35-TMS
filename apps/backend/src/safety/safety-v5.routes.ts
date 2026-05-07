import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { createWorkOrderWithLines } from "../maintenance/two-section-service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const dotInspectionSchema = z.object({
  inspection_date: z.string(),
  driver_uuid: z.string().uuid().optional(),
  unit_uuid: z.string().uuid().optional(),
  inspector_name: z.string().trim().min(1),
  inspection_level: z.number().int().min(1).max(6),
  location: z.string().trim().optional(),
  outcome: z.enum(["PASS", "WARNING", "OOS"]),
  cited_violations: z
    .array(
      z.object({
        code: z.string(),
        description: z.string().optional(),
        severity_points: z.number().int().optional(),
      })
    )
    .default([]),
  csa_basic_total_points: z.number().int().optional(),
  pdf_evidence_uuid: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const internalFineSchema = z.object({
  driver_uuid: z.string().uuid(),
  reason_uuid: z.string().uuid(),
  amount: z.number().positive(),
  imposed_date: z.string(),
  approved_by_user_uuid: z.string().uuid().optional(),
  status: z.enum(["pending", "approved", "disputed", "converted_to_liability", "voided"]).default("pending"),
  related_load_uuid: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const complaintSchema = z.object({
  complaint_date: z.string(),
  complainant_type: z.enum(["driver", "customer", "employee", "external", "anonymous"]),
  complainant_name: z.string().optional(),
  complainant_uuid: z.string().uuid().optional(),
  respondent_type: z.enum(["driver", "employee"]),
  respondent_uuid: z.string().uuid(),
  complaint_type_uuid: z.string().uuid(),
  summary: z.string().trim().min(1),
  evidence_doc_uuids: z.array(z.string().uuid()).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "investigating", "resolved", "dismissed", "escalated"]).default("open"),
  investigation_notes: z.string().optional(),
  resolution: z.string().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validateRole(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client);
  });
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

export async function registerSafetyV5Routes(app: FastifyInstance) {
  app.get("/api/v1/safety/v5/dot-inspections", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const inspections = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.dot_inspections WHERE operating_company_id = $1 ORDER BY inspection_date DESC, created_at DESC LIMIT 500`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { inspections };
  });

  app.post("/api/v1/safety/v5/dot-inspections", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!validateRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = dotInspectionSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      await client.query("BEGIN");
      try {
        const inspectionRes = await client.query(
          `
            INSERT INTO safety.dot_inspections (
              operating_company_id, inspection_date, driver_id, unit_id, inspector_name, inspection_level,
              location, outcome, cited_violations, csa_basic_total_points, pdf_evidence_id, notes
            ) VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            body.data.inspection_date,
            body.data.driver_uuid ?? null,
            body.data.unit_uuid ?? null,
            body.data.inspector_name,
            body.data.inspection_level,
            body.data.location ?? null,
            body.data.outcome,
            JSON.stringify(body.data.cited_violations ?? []),
            body.data.csa_basic_total_points ?? null,
            body.data.pdf_evidence_uuid ?? null,
            body.data.notes ?? null,
          ]
        );
        const inspection = inspectionRes.rows[0];
        let spawnedWo: { woUuid: string; display_id: string; classHint: string } | null = null;
        if (body.data.outcome === "OOS" && body.data.unit_uuid) {
          spawnedWo = await createWorkOrderWithLines(
            client,
            user.uuid,
            {
              operating_company_id: query.data.operating_company_id,
              wo_type: "repair",
              source_type: "IS",
              unit_id: body.data.unit_uuid,
              driver_id: body.data.driver_uuid ?? null,
              description: `DOT OOS inspection ${inspection.id}`,
              repair_location: "in_house",
              payment_timing: "in_house",
            },
            [],
            [
              {
                description: "DOT OOS corrective action",
                quantity: 1,
                unit_cost: 0,
                amount: 0,
                service_item_uuid: (await client.query(`SELECT id FROM catalogs.items_services ORDER BY created_at LIMIT 1`)).rows[0]?.id,
                sub_rows: (body.data.cited_violations ?? []).slice(0, 5).map((v: any) => ({
                  line_type: "labor",
                  description: `${v.code}: ${v.description ?? "DOT violation correction"}`,
                  quantity: 1,
                  unit_cost: 0,
                  amount: 0,
                })),
              },
            ]
          );
          await client.query(`UPDATE safety.dot_inspections SET spawned_wo_id = $2 WHERE id = $1`, [inspection.id, spawnedWo.woUuid]);
          await appendCrudAudit(
            client,
            user.uuid,
            "safety.dot_inspection.spawned_wo",
            { inspection_id: inspection.id, spawned_wo_id: spawnedWo.woUuid },
            "warning",
            "P3-T11.17-TWO-SECTION-V5"
          );
        }
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.dot_inspection.created",
          { inspection_id: inspection.id, outcome: body.data.outcome, spawned_wo_id: spawnedWo?.woUuid ?? null },
          body.data.outcome === "OOS" ? "warning" : "info",
          "P3-T11.17-TWO-SECTION-V5"
        );
        await client.query("COMMIT");
        return { inspection, spawned_wo: spawnedWo ? { uuid: spawnedWo.woUuid, display_id: spawnedWo.display_id } : null };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    return reply.code(201).send(created);
  });

  app.post("/api/v1/safety/internal-fines", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!validateRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = internalFineSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      await client.query("BEGIN");
      try {
        const fineRes = await client.query(
          `
            INSERT INTO safety.internal_fines (
              operating_company_id, driver_id, reason_id, amount, imposed_date, imposed_by_user_id, approved_by_user_id, status, related_load_id, notes
            ) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10)
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            body.data.driver_uuid,
            body.data.reason_uuid,
            body.data.amount,
            body.data.imposed_date,
            user.uuid,
            body.data.approved_by_user_uuid ?? null,
            body.data.status,
            body.data.related_load_uuid ?? null,
            body.data.notes ?? null,
          ]
        );
        const fine = fineRes.rows[0];
        let liability: Record<string, unknown> | null = null;
        if (body.data.status === "approved") {
          const liabRes = await client.query(
            `
              INSERT INTO driver_finance.driver_liabilities (
                operating_company_id, driver_id, type, source_description, original_amount, current_balance, paid_to_date, requires_acknowledgment, origin, origin_id, status
              )
              VALUES ($1,$2,'internal_fine',$3,$4,$4,0,true,'internal_fine',$5,'pending_recovery')
              RETURNING *
            `,
            [
              query.data.operating_company_id,
              body.data.driver_uuid,
              `Internal fine ${fine.id}`,
              Math.round(Number(body.data.amount) * 100),
              fine.id,
            ]
          );
          liability = liabRes.rows[0] ?? null;
          if (liability) {
            await client.query(
              `UPDATE safety.internal_fines SET status = 'converted_to_liability', driver_liability_id = $2 WHERE id = $1`,
              [fine.id, (liability as { id?: string }).id ?? null]
            );
            await appendCrudAudit(
              client,
              user.uuid,
              "safety.internal_fine.converted_to_liability",
              { internal_fine_id: fine.id, liability_id: (liability as { id?: string }).id ?? null },
              "warning",
              "P3-T11.17-TWO-SECTION-V5"
            );
          }
        }
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.internal_fine.created",
          { internal_fine_id: fine.id, status: body.data.status },
          "info",
          "P3-T11.17-TWO-SECTION-V5"
        );
        await client.query("COMMIT");
        return { fine, liability };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    return reply.code(201).send(created);
  });

  app.get("/api/v1/safety/internal-fines", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const fines = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT f.*, r.reason_code, r.reason_name
          FROM safety.internal_fines f
          LEFT JOIN catalogs.internal_fine_reasons r ON r.id = f.reason_id
          WHERE f.operating_company_id = $1
          ORDER BY f.imposed_date DESC, f.created_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { fines };
  });

  app.post("/api/v1/safety/v5/complaints", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!validateRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = complaintSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const complaint = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.complaints (
            operating_company_id, complaint_date, complainant_type, complainant_name, complainant_id,
            respondent_type, respondent_id, complaint_type_id, summary, evidence_doc_ids, severity, status,
            investigation_notes, resolution
          ) VALUES (
            $1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
          )
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.complaint_date,
          body.data.complainant_type,
          body.data.complainant_name ?? null,
          body.data.complainant_uuid ?? null,
          body.data.respondent_type,
          body.data.respondent_uuid,
          body.data.complaint_type_uuid,
          body.data.summary,
          body.data.evidence_doc_uuids ?? null,
          body.data.severity,
          body.data.status,
          body.data.investigation_notes ?? null,
          body.data.resolution ?? null,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.complaint.created",
        { complaint_id: row.id, severity: row.severity, status: row.status },
        "warning",
        "P3-T11.17-TWO-SECTION-V5"
      );
      return row;
    });
    return reply.code(201).send({ complaint });
  });

  app.get("/api/v1/safety/v5/complaints", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!validateRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const complaints = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT c.*, t.type_code, t.type_name
          FROM safety.complaints c
          LEFT JOIN catalogs.complaint_types t ON t.id = c.complaint_type_id
          WHERE c.operating_company_id = $1
          ORDER BY c.complaint_date DESC, c.created_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { complaints };
  });
}
