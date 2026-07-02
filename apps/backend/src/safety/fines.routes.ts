import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const finesQuerySchema = companyQuerySchema.extend({
  status: z.string().optional(),
  subject_type: z.enum(["driver", "company"]).optional(),
  subject_driver_id: z.string().uuid().optional(),
  issued_date_from: z.string().optional(),
  issued_date_to: z.string().optional(),
});

const createFineBody = z.object({
  subject_type: z.enum(["driver", "company"]),
  subject_driver_id: z.string().uuid().nullable().optional(),
  issued_by_authority: z.string().min(1),
  jurisdiction: z.string().nullable().optional(),
  violation_code: z.string().nullable().optional(),
  violation_description: z.string().min(1),
  issued_date: z.string().min(1),
  amount_cents: z.number().int().min(0),
  related_load_id: z.string().uuid().nullable().optional(),
  related_unit_id: z.string().uuid().nullable().optional(),
  source_doc_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const updateFineBody = z.object({
  issued_by_authority: z.string().optional(),
  jurisdiction: z.string().nullable().optional(),
  violation_code: z.string().nullable().optional(),
  violation_description: z.string().optional(),
  issued_date: z.string().optional(),
  amount_cents: z.number().int().min(0).optional(),
  paid_date: z.string().nullable().optional(),
  paid_amount_cents: z.number().int().min(0).nullable().optional(),
  paid_via_bank_transaction_id: z.string().uuid().nullable().optional(),
  status: z.enum(["open", "paid", "contested", "dismissed", "reduced"]).optional(),
  notes: z.string().nullable().optional(),
});

const updateStatusBody = z.object({
  notes: z.string().min(1).optional(),
});

const reduceFineBody = z.object({
  amount_cents: z.number().int().min(0),
  reason: z.string().min(1),
});

const linkPaymentBody = z.object({
  bank_transaction_id: z.string().uuid(),
  paid_date: z.string().min(1),
  paid_amount_cents: z.number().int().min(0),
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

export async function registerSafetyFinesRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/fines", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = finesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const filters = ["operating_company_id = $1", "deactivated_at IS NULL"];
      const values: unknown[] = [q.operating_company_id];
      if (q.status) {
        values.push(q.status);
        filters.push(`status = $${values.length}`);
      }
      if (q.subject_type) {
        values.push(q.subject_type);
        filters.push(`subject_type = $${values.length}`);
      }
      if (q.subject_driver_id) {
        values.push(q.subject_driver_id);
        filters.push(`subject_driver_id = $${values.length}`);
      }
      if (q.issued_date_from) {
        values.push(q.issued_date_from);
        filters.push(`issued_date >= $${values.length}::date`);
      }
      if (q.issued_date_to) {
        values.push(q.issued_date_to);
        filters.push(`issued_date <= $${values.length}::date`);
      }
      const res = await client.query(
        `
          SELECT *
          FROM safety.civil_fines
          WHERE ${filters.join(" AND ")}
          ORDER BY issued_date DESC, created_at DESC
          LIMIT 500
        `,
        values
      );
      return res.rows;
    });
    return { fines: rows };
  });

  app.get("/api/v1/safety/fines/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.civil_fines WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "fine_not_found" });
    return row;
  });

  app.post("/api/v1/safety/fines", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = createFineBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const fine = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.civil_fines (
            operating_company_id, subject_type, subject_driver_id, issued_by_authority, jurisdiction, violation_code,
            violation_description, issued_date, amount_cents, related_load_id, related_unit_id, source_doc_id, notes,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,$14,$14
          )
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.subject_type,
          body.data.subject_driver_id ?? null,
          body.data.issued_by_authority,
          body.data.jurisdiction ?? null,
          body.data.violation_code ?? null,
          body.data.violation_description,
          body.data.issued_date,
          body.data.amount_cents,
          body.data.related_load_id ?? null,
          body.data.related_unit_id ?? null,
          body.data.source_doc_id ?? null,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const created = res.rows[0] ?? null;
      if (created) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.fine.created",
          {
            resource_type: "safety.civil_fines",
            resource_id: created.id,
            operating_company_id: query.data.operating_company_id,
            subject_type: created.subject_type,
            amount_cents: created.amount_cents,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return created;
    });
    return reply.code(201).send(fine);
  });

  app.patch("/api/v1/safety/fines/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = updateFineBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const payload = body.data;
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return reply.code(400).send({ error: "no_changes" });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [];
      entries.forEach(([key, value], index) => {
        const param = index + 1;
        if (key === "paid_date") {
          sets.push(`${key} = $${param}::date`);
        } else {
          sets.push(`${key} = $${param}`);
        }
        values.push(value);
      });
      sets.push(`updated_by_user_id = $${values.length + 1}`);
      values.push(user.uuid);
      values.push(params.data.id, query.data.operating_company_id);
      const res = await client.query(
        `
          UPDATE safety.civil_fines
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
          "safety.fine.updated",
          {
            resource_type: "safety.civil_fines",
            resource_id: row.id,
            operating_company_id: query.data.operating_company_id,
            changes: payload,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "fine_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/fines/:id/convert-to-liability", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await client.query("BEGIN");
      try {
        const fineRes = await client.query(
          `
            SELECT *
            FROM safety.civil_fines
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
            FOR UPDATE
          `,
          [params.data.id, query.data.operating_company_id]
        );
        const fine = fineRes.rows[0] as Record<string, unknown> | undefined;
        if (!fine) {
          await client.query("ROLLBACK");
          return { code: 404 as const, error: "fine_not_found" };
        }
        if (String(fine.subject_type) !== "driver") {
          await client.query("ROLLBACK");
          return { code: 422 as const, error: "fine_subject_must_be_driver" };
        }
        if (fine.converted_to_liability_id) {
          await client.query("ROLLBACK");
          return { code: 409 as const, error: "fine_already_converted" };
        }
        if (!["open", "reduced"].includes(String(fine.status ?? ""))) {
          await client.query("ROLLBACK");
          return { code: 422 as const, error: "fine_not_convertible" };
        }

        const driverRes = await client.query(
          `SELECT id, status FROM mdata.drivers WHERE id = $1 LIMIT 1`,
          [fine.subject_driver_id]
        );
        const driver = driverRes.rows[0] as Record<string, unknown> | undefined;
        if (!driver || String(driver.status ?? "").toLowerCase() !== "active") {
          await client.query("ROLLBACK");
          return { code: 422 as const, error: "driver_not_active" };
        }

        const amount = Number(fine.amount_cents ?? 0);
        const liabilityRes = await client.query(
          `
            INSERT INTO driver_finance.driver_liabilities (
              operating_company_id,
              driver_id,
              type,
              source_description,
              original_amount,
              current_balance,
              paid_to_date,
              requires_acknowledgment,
              origin,
              origin_id,
              reference_doc_id,
              status
            ) VALUES (
              $1,$2,'civil_fine',$3,$4,$4,0,true,'safety_fine',$5,$6,'pending_recovery'
            )
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            fine.subject_driver_id,
            `Fine: ${String(fine.violation_description)} (${String(fine.issued_by_authority)} ${String(fine.jurisdiction ?? "")})`,
            amount,
            fine.id,
            fine.source_doc_id ?? null,
          ]
        );
        const liability = liabilityRes.rows[0] as Record<string, unknown> | undefined;
        if (!liability) throw new Error("liability_create_failed");

        const fineUpdateRes = await client.query(
          `
            UPDATE safety.civil_fines
            SET converted_to_liability_id = $2,
                converted_at = now(),
                converted_by_user_id = $3,
                updated_by_user_id = $3
            WHERE id = $1
            RETURNING *
          `,
          [fine.id, liability.id, user.uuid]
        );
        const updatedFine = fineUpdateRes.rows[0] as Record<string, unknown> | undefined;

        await appendCrudAudit(
          client,
          user.uuid,
          "safety.fine.converted_to_liability",
          {
            fine_id: fine.id,
            liability_id: liability.id,
            driver_id: fine.subject_driver_id,
            amount_cents: amount,
            workflow: "WF-035",
            operating_company_id: query.data.operating_company_id,
          },
          "warning",
          "BT-3-SAFETY-GAPS-FILL"
        );
        await client.query("COMMIT");
        return {
          code: 200 as const,
          fine: updatedFine ?? fine,
          liability,
          message:
            "Fine converted to driver liability. Will be deducted from next driver settlement.",
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result;
  });

  app.post("/api/v1/safety/fines/:id/contest", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = updateStatusBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.civil_fines
          SET status = 'contested',
              notes = COALESCE($3, notes),
              updated_by_user_id = $4
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.notes ?? null, user.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "fine_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/fines/:id/dismiss", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = updateStatusBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.civil_fines
          SET status = 'dismissed',
              notes = COALESCE($3, notes),
              updated_by_user_id = $4
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.notes ?? null, user.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "fine_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/fines/:id/reduce", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = reduceFineBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.civil_fines
          SET amount_cents = $3,
              status = 'reduced',
              notes = COALESCE(notes || E'\n', '') || $4,
              updated_by_user_id = $5
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.amount_cents, body.data.reason, user.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "fine_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/fines/:id/link-payment", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = linkPaymentBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.civil_fines
          SET paid_via_bank_transaction_id = $3,
              paid_date = $4::date,
              paid_amount_cents = $5,
              status = 'paid',
              updated_by_user_id = $6
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [
          params.data.id,
          query.data.operating_company_id,
          body.data.bank_transaction_id,
          body.data.paid_date,
          body.data.paid_amount_cents,
          user.uuid,
        ]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.fine.payment_linked",
          {
            resource_type: "safety.civil_fines",
            resource_id: row.id,
            bank_transaction_id: body.data.bank_transaction_id,
            paid_amount_cents: body.data.paid_amount_cents,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.fine.paid",
          {
            resource_type: "safety.civil_fines",
            resource_id: row.id,
            paid_amount_cents: body.data.paid_amount_cents,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "fine_not_found" });
    return updated;
  });
}
