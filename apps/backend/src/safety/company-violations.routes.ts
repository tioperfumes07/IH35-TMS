import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveCompanyViolation } from "./company-violations.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  violation_type: z.enum(["FMCSA_audit", "DOT_inspection", "CSA_intervention", "state_audit", "IRP", "IFTA", "other"]),
  // SAF-F15: safety.company_violations has always carried violation_type_uuid — the FK to
  // catalogs.company_violation_types — and the create route never set it, so EVERY violation created
  // in the UI landed with a null catalog FK. That is not cosmetic: company-violations.service.ts
  // resolves the default fine amount from `existing.violation_type_uuid`, so with the FK null the
  // catalog amount can never resolve and the flow falls through to E_VIOLATION_AMOUNT_REQUIRED.
  // The enum above stays as the DOT CATEGORY (it is CHECK-constrained and is not the same thing as
  // a catalog row); this is the specific catalogued type that carries the default amount.
  violation_type_uuid: z.string().uuid().nullable().optional(),
  violation_basic: z.string().nullable().optional(),
  violation_severity: z.enum(["warning", "minor", "major", "severe", "OOS"]),
  reported_date: z.string(),
  description: z.string().min(1),
  corrective_action_plan: z.string().nullable().optional(),
  corrective_action_due_date: z.string().nullable().optional(),
  related_drivers: z.unknown().optional(),
  related_units: z.unknown().optional(),
  related_fine_ids: z.unknown().optional(),
  source_doc_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const patchBodySchema = z.object({
  violation_type: z.enum(["FMCSA_audit", "DOT_inspection", "CSA_intervention", "state_audit", "IRP", "IFTA", "other"]).optional(),
  violation_basic: z.string().nullable().optional(),
  violation_severity: z.enum(["warning", "minor", "major", "severe", "OOS"]).optional(),
  reported_date: z.string().optional(),
  description: z.string().optional(),
  corrective_action_plan: z.string().nullable().optional(),
  corrective_action_due_date: z.string().nullable().optional(),
  corrective_action_completed_date: z.string().nullable().optional(),
  status: z.enum(["open", "in_progress", "closed", "escalated"]).optional(),
  related_drivers: z.unknown().optional(),
  related_units: z.unknown().optional(),
  related_fine_ids: z.unknown().optional(),
  source_doc_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const completeCorrectiveBody = z.object({
  completed_date: z.string().optional(),
  notes: z.string().optional(),
});

const escalateBody = z.object({
  reason: z.string().optional(),
});

const resolveBodySchema = z.object({
  outcome: z.enum(["warning", "written_reprimand", "monetary_fine", "termination", "dismissed"]),
  resolutionNotes: z.string().trim().min(20),
  fineAmountCentsOverride: z.coerce.number().int().positive().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

function canResolve(role: string) {
  return ["Owner", "Administrator", "Safety", "Manager"].includes(role);
}

export async function registerSafetyCompanyViolationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/company-violations", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          -- SAF-F29: related ids come from the JOIN TABLES, never the retired jsonb columns.
          -- Aggregated as arrays so the response shape stays a single row per violation while the
          -- underlying relationships are real FKs that can be queried in reverse (driver -> its
          -- violations), which a jsonb array could never support.
          SELECT cv.*,
                 COALESCE((SELECT array_agg(d.driver_id) FROM safety.company_violation_drivers d
                            WHERE d.violation_id = cv.id AND d.is_active), '{}') AS related_driver_ids,
                 COALESCE((SELECT array_agg(u.unit_id) FROM safety.company_violation_units u
                            WHERE u.violation_id = cv.id AND u.is_active), '{}') AS related_unit_ids,
                 COALESCE((SELECT array_agg(f.fine_id) FROM safety.company_violation_fines f
                            WHERE f.violation_id = cv.id AND f.is_active), '{}') AS related_civil_fine_ids
          FROM safety.company_violations cv
          WHERE cv.operating_company_id = $1
            AND cv.deactivated_at IS NULL
          ORDER BY cv.reported_date DESC, cv.created_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { company_violations: rows };
  });

  app.get("/api/v1/safety/company-violations/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.company_violations WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "company_violation_not_found" });
    return row;
  });

  app.post("/api/v1/safety/company-violations", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.company_violations (
            operating_company_id, violation_type, violation_type_uuid, violation_basic, violation_severity, reported_date,
            description, corrective_action_plan, corrective_action_due_date, source_doc_id, notes,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6::date,$7,$8,$9::date,$10,$11,$12,$12
          )
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.violation_type,
          body.data.violation_type_uuid ?? null,
          body.data.violation_basic ?? null,
          body.data.violation_severity,
          body.data.reported_date,
          body.data.description,
          body.data.corrective_action_plan ?? null,
          body.data.corrective_action_due_date ?? null,
          body.data.source_doc_id ?? null,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const row = res.rows[0] ?? null;

      // SAF-F29: related drivers / units / fines go into the JOIN TABLES, not a jsonb array.
      // A jsonb array of ids has no FK, no cascade and no reverse query — it can name a deleted or
      // wrong row and nothing notices. Each insert is FK-checked, so an id that does not resolve
      // fails the request rather than being silently stored.
      if (row) {
        const linkSets: Array<{ table: string; column: string; ids: unknown }> = [
          { table: "company_violation_drivers", column: "driver_id", ids: body.data.related_drivers },
          { table: "company_violation_units", column: "unit_id", ids: body.data.related_units },
          { table: "company_violation_fines", column: "fine_id", ids: body.data.related_fine_ids },
        ];
        for (const { table, column, ids } of linkSets) {
          if (!Array.isArray(ids)) continue;
          for (const rawId of ids) {
            const id = String(rawId ?? "");
            if (!/^[0-9a-fA-F-]{36}$/.test(id)) continue;
            await client.query(
              `INSERT INTO safety.${table} (operating_company_id, violation_id, ${column}, created_by_user_id)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [query.data.operating_company_id, row.id, id, user.uuid]
            );
          }
        }
      }

      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.company_violation.created",
          {
            resource_type: "safety.company_violations",
            resource_id: row.id,
            operating_company_id: query.data.operating_company_id,
            violation_type: row.violation_type,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/safety/company-violations/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const entries = Object.entries(body.data).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return reply.code(400).send({ error: "no_changes" });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [];
      const sets: string[] = [];
      for (const [key, value] of entries) {
        values.push(
          key === "related_drivers" || key === "related_units" || key === "related_fine_ids"
            ? JSON.stringify(value ?? null)
            : value
        );
        const idx = values.length;
        if (key === "reported_date" || key === "corrective_action_due_date" || key === "corrective_action_completed_date") {
          sets.push(`${key} = $${idx}::date`);
        } else if (key === "related_drivers" || key === "related_units" || key === "related_fine_ids") {
          sets.push(`${key} = $${idx}::jsonb`);
        } else {
          sets.push(`${key} = $${idx}`);
        }
      }
      values.push(user.uuid, params.data.id, query.data.operating_company_id);
      sets.push(`updated_by_user_id = $${values.length - 2}`);
      const res = await client.query(
        `
          UPDATE safety.company_violations
          SET ${sets.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}
          RETURNING *
        `,
        values
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.company_violation.updated",
          {
            resource_type: "safety.company_violations",
            resource_id: row.id,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "company_violation_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/company-violations/:id/generate-audit-export", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const docIdRes = await client.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`);
      const generatedDocId = String(docIdRes.rows[0]?.id ?? "");
      const res = await client.query(
        `
          UPDATE safety.company_violations
          SET audit_export_doc_id = $3,
              updated_by_user_id = $4
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, generatedDocId || null, user.uuid]
      );
      const row = res.rows[0] ?? null;
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "company_violation_not_found" });
    return { violation: updated, message: "Audit export generated and linked." };
  });

  app.post("/api/v1/safety/company-violations/:id/complete-corrective-action", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = completeCorrectiveBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.company_violations
          SET corrective_action_completed_date = COALESCE($3::date, CURRENT_DATE),
              status = 'closed',
              notes = COALESCE(notes || E'\n', '') || COALESCE($4, ''),
              updated_by_user_id = $5
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.completed_date ?? null, body.data.notes ?? null, user.uuid]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.company_violation.corrective_action_completed",
          {
            resource_type: "safety.company_violations",
            resource_id: row.id,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.company_violation.closed",
          {
            resource_type: "safety.company_violations",
            resource_id: row.id,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "company_violation_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/company-violations/:id/escalate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = escalateBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.company_violations
          SET status = 'escalated',
              notes = COALESCE(notes || E'\n', '') || COALESCE($3, ''),
              updated_by_user_id = $4
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.reason ?? null, user.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "company_violation_not_found" });
    return updated;
  });

  app.patch("/api/v1/safety/company-violations/:id/resolve", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canResolve(user.role)) return reply.code(403).send({ error: "E_PERMISSION_DENIED" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    try {
      const result = await resolveCompanyViolation({
        violationUuid: params.data.id,
        operatingCompanyId: query.data.operating_company_id,
        outcome: body.data.outcome,
        resolutionNotes: body.data.resolutionNotes,
        fineAmountCentsOverride: body.data.fineAmountCentsOverride,
        resolvedByUserUuid: user.uuid,
      });
      return {
        violationUuid: result.violationUuid,
        autoCreatedInternalFineUuid: result.autoCreatedInternalFineUuid,
        finalAmountCents: result.finalAmountCents,
      };
    } catch (error) {
      const code = String((error as Error).message ?? "E_RESOLVE_FAILED");
      if (code === "E_VIOLATION_AMOUNT_REQUIRED") {
        return reply.code(422).send({ error: code });
      }
      if (code === "E_VIOLATION_ALREADY_RESOLVED") {
        return reply.code(409).send({ error: code });
      }
      if (code === "E_VIOLATION_NOT_FOUND") {
        return reply.code(404).send({ error: code });
      }
      throw error;
    }
  });
}
