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
const companyViolationListQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  violation_type: z.enum([
    "FMCSA_audit",
    "DOT_inspection",
    "CSA_intervention",
    "state_audit",
    "IRP",
    "IFTA",
    "other",
  ]),
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
  violation_type: z
    .enum([
      "FMCSA_audit",
      "DOT_inspection",
      "CSA_intervention",
      "state_audit",
      "IRP",
      "IFTA",
      "other",
    ])
    .optional(),
  violation_basic: z.string().nullable().optional(),
  violation_severity: z
    .enum(["warning", "minor", "major", "severe", "OOS"])
    .optional(),
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
  outcome: z.enum([
    "warning",
    "written_reprimand",
    "monetary_fine",
    "termination",
    "dismissed",
  ]),
  resolutionNotes: z.string().trim().min(20),
  fineAmountCentsOverride: z.coerce.number().int().positive().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: "validation_error",
    message: "Check the company violation details and try again.",
    details: error.flatten(),
  });
}

function sendForbidden(reply: FastifyReply) {
  return reply.code(403).send({
    error: "forbidden",
    message: "You do not have permission to change company violations.",
  });
}

function sendNotFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: "company_violation_not_found",
    message: "The company violation could not be found.",
  });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>,
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(
      "SELECT set_config('app.operating_company_id', $1::text, true)",
      [operatingCompanyId],
    );
    return fn(client);
  });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

function canResolve(role: string) {
  return ["Owner", "Administrator", "Safety", "Manager"].includes(role);
}

export async function registerSafetyCompanyViolationsRoutes(
  app: FastifyInstance,
) {
  app.get(
    "/api/v1/safety/company-violations",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = companyViolationListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const result = await withCompanyScope(
        user.uuid,
        query.data.operating_company_id,
        async (client) => {
          if (query.data.driver_id) {
            const parent = await client.query(
              `SELECT 1
             FROM mdata.drivers md
             WHERE md.id = $1::uuid
               AND md.archived_at IS NULL
               AND (
                 md.operating_company_id = $2::uuid
                 OR EXISTS (
                   SELECT 1 FROM mdata.driver_company_authorizations dca
                   WHERE dca.driver_id = md.id
                     AND dca.company_id = $2::uuid
                     AND dca.is_authorized = true
                     AND dca.deactivated_at IS NULL
                 )
               )
             LIMIT 1`,
              [query.data.driver_id, query.data.operating_company_id],
            );
            if (!parent.rows[0]) return { found: false as const, rows: [], total_count: 0 };
          }
          const countRes = await client.query(
            `SELECT count(*)::int AS total_count
             FROM safety.company_violations cv
             WHERE cv.operating_company_id = $1::uuid
               AND cv.deactivated_at IS NULL
               AND ($2::uuid IS NULL OR EXISTS (
                 SELECT 1 FROM safety.company_violation_drivers d
                 WHERE d.violation_id = cv.id AND d.driver_id = $2::uuid AND d.is_active
               ))
               AND ($3::uuid IS NULL OR EXISTS (
                 SELECT 1 FROM safety.company_violation_units u
                 WHERE u.violation_id = cv.id AND u.unit_id = $3::uuid AND u.is_active
               ))`,
            [query.data.operating_company_id, query.data.driver_id ?? null, query.data.unit_id ?? null],
          );
          const res = await client.query(
            `
          -- SAF-F29: related ids come from the JOIN TABLES, never the retired jsonb columns.
          -- Aggregated as arrays so the response shape stays a single row per violation while the
          -- underlying relationships are real FKs that can be queried in reverse (driver -> its
          -- violations), which a jsonb array could never support.
          SELECT cv.*,
                 COALESCE((SELECT array_agg(d.driver_id) FROM safety.company_violation_drivers d
                            WHERE d.violation_id = cv.id AND d.is_active), '{}') AS related_driver_ids,
                 COALESCE((SELECT jsonb_object_agg(d.driver_id::text, NULLIF(trim(concat_ws(' ', md.first_name, md.last_name)), ''))
                           FROM safety.company_violation_drivers d
                           JOIN mdata.drivers md ON md.id = d.driver_id
                            AND (
                              md.operating_company_id = cv.operating_company_id
                              OR EXISTS (
                                SELECT 1 FROM mdata.driver_company_authorizations label_dca
                                WHERE label_dca.driver_id = md.id
                                  AND label_dca.company_id = cv.operating_company_id
                                  AND label_dca.is_authorized = true
                                  AND label_dca.deactivated_at IS NULL
                              )
                            )
                           WHERE d.violation_id = cv.id AND d.is_active), '{}'::jsonb) AS related_driver_labels,
                 COALESCE((SELECT array_agg(u.unit_id) FROM safety.company_violation_units u
                            WHERE u.violation_id = cv.id AND u.is_active), '{}') AS related_unit_ids,
                 COALESCE((SELECT jsonb_object_agg(u.unit_id::text, mu.unit_number)
                           FROM safety.company_violation_units u
                           JOIN mdata.units mu ON mu.id = u.unit_id
                                              AND COALESCE(mu.currently_leased_to_company_id, mu.owner_company_id) = cv.operating_company_id
                           WHERE u.violation_id = cv.id AND u.is_active), '{}'::jsonb) AS related_unit_labels,
                 COALESCE((SELECT array_agg(f.fine_id) FROM safety.company_violation_fines f
                            WHERE f.violation_id = cv.id AND f.is_active), '{}') AS related_civil_fine_ids
          FROM safety.company_violations cv
          WHERE cv.operating_company_id = $1::uuid
            AND cv.deactivated_at IS NULL
            AND ($2::uuid IS NULL OR EXISTS (
              SELECT 1 FROM safety.company_violation_drivers d
              WHERE d.violation_id = cv.id AND d.driver_id = $2::uuid AND d.is_active
            ))
            AND ($3::uuid IS NULL OR EXISTS (
              SELECT 1 FROM safety.company_violation_units u
              WHERE u.violation_id = cv.id AND u.unit_id = $3::uuid AND u.is_active
            ))
          ORDER BY cv.reported_date DESC, cv.created_at DESC
          LIMIT $4 OFFSET $5
        `,
            [
              query.data.operating_company_id,
              query.data.driver_id ?? null,
              query.data.unit_id ?? null,
              query.data.limit,
              query.data.offset,
            ],
          );
          return { found: true as const, rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
        },
      );
      if (!result.found)
        return reply.code(404).send({ error: "mdata_driver_not_found" });
      return { company_violations: result.rows, total_count: result.total_count };
    },
  );

  app.get(
    "/api/v1/safety/company-violations/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const row = await withCompanyScope(
        user.uuid,
        query.data.operating_company_id,
        async (client) => {
          // SAF-B28: this was a bare `SELECT *`, so the detail read returned the RETIRED jsonb columns
          // and none of the join-table arrays that LIST (:117-123) already returns. Once PATCH writes
          // the join tables, a bare SELECT * would make every link edit appear to vanish on reload —
          // the operator would see the frozen jsonb, not what they just saved. Same aggregation as
          // LIST, same column names, so detail and list agree.
          const res = await client.query(
            `SELECT cv.*,
                COALESCE((SELECT array_agg(d.driver_id) FROM safety.company_violation_drivers d
                           WHERE d.violation_id = cv.id AND d.is_active), '{}') AS related_driver_ids,
                COALESCE((SELECT jsonb_object_agg(d.driver_id::text, NULLIF(trim(concat_ws(' ', md.first_name, md.last_name)), ''))
                          FROM safety.company_violation_drivers d
                          JOIN mdata.drivers md ON md.id = d.driver_id
                           AND (
                             md.operating_company_id = cv.operating_company_id
                             OR EXISTS (
                               SELECT 1 FROM mdata.driver_company_authorizations label_dca
                               WHERE label_dca.driver_id = md.id
                                 AND label_dca.company_id = cv.operating_company_id
                                 AND label_dca.is_authorized = true
                                 AND label_dca.deactivated_at IS NULL
                             )
                           )
                          WHERE d.violation_id = cv.id AND d.is_active), '{}'::jsonb) AS related_driver_labels,
                COALESCE((SELECT array_agg(u.unit_id) FROM safety.company_violation_units u
                           WHERE u.violation_id = cv.id AND u.is_active), '{}') AS related_unit_ids,
                COALESCE((SELECT jsonb_object_agg(u.unit_id::text, mu.unit_number)
                          FROM safety.company_violation_units u
                          JOIN mdata.units mu ON mu.id = u.unit_id
                                             AND COALESCE(mu.currently_leased_to_company_id, mu.owner_company_id) = cv.operating_company_id
                          WHERE u.violation_id = cv.id AND u.is_active), '{}'::jsonb) AS related_unit_labels,
                COALESCE((SELECT array_agg(f.fine_id) FROM safety.company_violation_fines f
                           WHERE f.violation_id = cv.id AND f.is_active), '{}') AS related_civil_fine_ids
           FROM safety.company_violations cv
          WHERE cv.id = $1 AND cv.operating_company_id = $2::uuid
          LIMIT 1`,
            [params.data.id, query.data.operating_company_id],
          );
          return res.rows[0] ?? null;
        },
      );
      if (!row) return sendNotFound(reply);
      return row;
    },
  );

  app.post(
    "/api/v1/safety/company-violations",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canMutate(user.role)) return sendForbidden(reply);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const body = createBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      const created = await withCompanyScope(
        user.uuid,
        query.data.operating_company_id,
        async (client) => {
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
            ],
          );
          const row = res.rows[0] ?? null;

          // SAF-F29: related drivers / units / fines go into the JOIN TABLES, not a jsonb array.
          // A jsonb array of ids has no FK, no cascade and no reverse query — it can name a deleted or
          // wrong row and nothing notices. Each insert is FK-checked, so an id that does not resolve
          // fails the request rather than being silently stored.
          if (row) {
            const linkSets: Array<{
              table: string;
              column: string;
              ids: unknown;
            }> = [
              {
                table: "company_violation_drivers",
                column: "driver_id",
                ids: body.data.related_drivers,
              },
              {
                table: "company_violation_units",
                column: "unit_id",
                ids: body.data.related_units,
              },
              {
                table: "company_violation_fines",
                column: "fine_id",
                ids: body.data.related_fine_ids,
              },
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
                  [query.data.operating_company_id, row.id, id, user.uuid],
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
              "BT-3-SAFETY-GAPS-FILL",
            );
          }
          return row;
        },
      );
      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/api/v1/safety/company-violations/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canMutate(user.role)) return sendForbidden(reply);
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const body = patchBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      const entries = Object.entries(body.data).filter(
        ([, value]) => value !== undefined,
      );
      if (entries.length === 0) {
        return reply.code(400).send({
          error: "no_changes",
          message:
            "Make at least one change before saving the company violation.",
        });
      }

      // SAF-B28: the three retired jsonb columns are handled by the join-table sync below and are
      // NEVER written here. The create path stopped writing them when SAF-F29 landed, but this PATCH
      // kept going — so an operator edit wrote ids into a column no reader consumes, while the join
      // tables the readers DO consume went untouched. That split is what makes the auto-fine trigger
      // miss a driver on create->close, and it is what blocks 202609130000 §3 (whose stop-write
      // trigger would raise 0A000 on every edit that still writes them).
      const LINK_KEYS = [
        "related_drivers",
        "related_units",
        "related_fine_ids",
      ] as const;
      type LinkKey = (typeof LINK_KEYS)[number];
      const isLinkKey = (k: string): k is LinkKey =>
        (LINK_KEYS as readonly string[]).includes(k);
      const columnEntries = entries.filter(([key]) => !isLinkKey(key));
      const linkEntries = entries.filter(([key]) => isLinkKey(key));

      const updated = await withCompanyScope(
        user.uuid,
        query.data.operating_company_id,
        async (client) => {
          const values: unknown[] = [];
          const sets: string[] = [];
          for (const [key, value] of columnEntries) {
            values.push(value);
            const idx = values.length;
            if (
              key === "reported_date" ||
              key === "corrective_action_due_date" ||
              key === "corrective_action_completed_date"
            ) {
              sets.push(`${key} = $${idx}::date`);
            } else {
              sets.push(`${key} = $${idx}`);
            }
          }
          values.push(
            user.uuid,
            params.data.id,
            query.data.operating_company_id,
          );
          sets.push(`updated_by_user_id = $${values.length - 2}`);
          const res = await client.query(
            `
          UPDATE safety.company_violations
          SET ${sets.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}::uuid
          RETURNING *
        `,
            values,
          );
          const row = res.rows[0] ?? null;

          // SAF-B28 join-table SYNC — the edit-path mirror of the create path's link inserts.
          //
          // Semantics match what an operator means by editing the list: ids present in the payload are
          // linked (or RE-linked, if previously retired), ids absent from the payload are retired. Only
          // a key actually sent in the PATCH body is synced, so an edit that touches just the narrative
          // fields leaves the links completely alone — absent is not the same as empty.
          //
          // Retirement is `is_active = false`, NOT a DELETE: DELETE is REVOKEd on all three tables
          // (202607840000) and void-not-delete is repo law. This also matters for correctness, because
          // the auto-fine trigger's driver lookup filters on `cvd.is_active` — so a retired link stops
          // producing a fine without destroying the record that it once existed.
          if (row) {
            const linkTargets: Record<
              LinkKey,
              { table: string; column: string }
            > = {
              related_drivers: {
                table: "company_violation_drivers",
                column: "driver_id",
              },
              related_units: {
                table: "company_violation_units",
                column: "unit_id",
              },
              related_fine_ids: {
                table: "company_violation_fines",
                column: "fine_id",
              },
            };
            for (const [key, value] of linkEntries) {
              if (!isLinkKey(key)) continue;
              const { table, column } = linkTargets[key];
              const ids = Array.isArray(value)
                ? value
                    .map((raw) => String(raw ?? ""))
                    .filter((id) => /^[0-9a-fA-F-]{36}$/.test(id))
                : [];

              for (const id of ids) {
                // FK-checked, so an id that does not resolve fails the request instead of being stored
                // as an unverifiable string — the whole reason the jsonb array was retired.
                await client.query(
                  `INSERT INTO safety.${table} (operating_company_id, violation_id, ${column}, created_by_user_id, is_active)
               VALUES ($1, $2, $3, $4, TRUE)
               ON CONFLICT (violation_id, ${column})
               DO UPDATE SET is_active = TRUE`,
                  [query.data.operating_company_id, row.id, id, user.uuid],
                );
              }

              // Retire every link the operator dropped. `<> ALL` is NULL-safe against an empty array
              // here because the array is always a well-formed uuid[] (possibly zero-length), and a
              // zero-length array retires every link — which is exactly what clearing the field means.
              await client.query(
                `UPDATE safety.${table}
                SET is_active = FALSE
              WHERE violation_id = $1
                AND operating_company_id = $2::uuid
                AND is_active
                AND ${column} <> ALL ($3::uuid[])`,
                [row.id, query.data.operating_company_id, ids],
              );
            }
          }

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
              "BT-3-SAFETY-GAPS-FILL",
            );
          }
          return row;
        },
      );
      if (!updated) return sendNotFound(reply);
      return updated;
    },
  );

  app.post(
    "/api/v1/safety/company-violations/:id/generate-audit-export",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canMutate(user.role)) return sendForbidden(reply);
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const updated = await withCompanyScope(
        user.uuid,
        query.data.operating_company_id,
        async (client) => {
          const docIdRes = await client.query<{ id: string }>(
            `SELECT gen_random_uuid()::text AS id`,
          );
          const generatedDocId = String(docIdRes.rows[0]?.id ?? "");
          const res = await client.query(
            `
          UPDATE safety.company_violations
          SET audit_export_doc_id = $3,
              updated_by_user_id = $4
          WHERE id = $1
            AND operating_company_id = $2::uuid
          RETURNING *
        `,
            [
              params.data.id,
              query.data.operating_company_id,
              generatedDocId || null,
              user.uuid,
            ],
          );
          const row = res.rows[0] ?? null;
          return row;
        },
      );
      if (!updated) return sendNotFound(reply);
      return {
        violation: updated,
        message: "Audit export generated and linked.",
      };
    },
  );

  app.post(
    "/api/v1/safety/company-violations/:id/complete-corrective-action",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canMutate(user.role)) return sendForbidden(reply);
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const body = completeCorrectiveBody.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      const updated = await withCompanyScope(
        user.uuid,
        query.data.operating_company_id,
        async (client) => {
          const res = await client.query(
            `
          UPDATE safety.company_violations
          SET corrective_action_completed_date = COALESCE($3::date, CURRENT_DATE),
              status = 'closed',
              notes = COALESCE(notes || E'\n', '') || COALESCE($4, ''),
              updated_by_user_id = $5
          WHERE id = $1
            AND operating_company_id = $2::uuid
          RETURNING *
        `,
            [
              params.data.id,
              query.data.operating_company_id,
              body.data.completed_date ?? null,
              body.data.notes ?? null,
              user.uuid,
            ],
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
              "BT-3-SAFETY-GAPS-FILL",
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
              "BT-3-SAFETY-GAPS-FILL",
            );
          }
          return row;
        },
      );
      if (!updated) return sendNotFound(reply);
      return updated;
    },
  );

  app.post(
    "/api/v1/safety/company-violations/:id/escalate",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canMutate(user.role)) return sendForbidden(reply);
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const body = escalateBody.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      const updated = await withCompanyScope(
        user.uuid,
        query.data.operating_company_id,
        async (client) => {
          const res = await client.query(
            `
          UPDATE safety.company_violations
          SET status = 'escalated',
              notes = COALESCE(notes || E'\n', '') || COALESCE($3, ''),
              updated_by_user_id = $4
          WHERE id = $1
            AND operating_company_id = $2::uuid
          RETURNING *
        `,
            [
              params.data.id,
              query.data.operating_company_id,
              body.data.reason ?? null,
              user.uuid,
            ],
          );
          return res.rows[0] ?? null;
        },
      );
      if (!updated) return sendNotFound(reply);
      return updated;
    },
  );

  app.patch(
    "/api/v1/safety/company-violations/:id/resolve",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canResolve(user.role)) {
        return reply.code(403).send({
          error: "E_PERMISSION_DENIED",
          message: "You do not have permission to resolve company violations.",
        });
      }

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
          return reply.code(422).send({
            error: code,
            message:
              "Enter a fine amount before resolving this violation as a monetary fine.",
          });
        }
        if (code === "E_VIOLATION_ALREADY_RESOLVED") {
          return reply.code(409).send({
            error: code,
            message: "This company violation has already been resolved.",
          });
        }
        if (code === "E_VIOLATION_NOT_FOUND") {
          return reply.code(404).send({
            error: code,
            message: "The company violation could not be found.",
          });
        }
        req.log.error(
          { err: error, violationId: params.data.id },
          "Failed to resolve company violation",
        );
        return reply.code(500).send({
          error: "server_error",
          message: "We couldn't resolve the company violation. Try again.",
        });
      }
    },
  );
}
