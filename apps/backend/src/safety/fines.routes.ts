import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { createSettlementDeduction } from "../driver-finance/deductions.service.js";
import { postCompanyPaidCivilFine } from "../accounting/safety-fine-posting/poster.service.js";

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
  // LST-LINK-02: the real reference. violation_code stays as the human/legacy code; this is the join
  // key, so catalogs.civil_fine_types stops being an FK island.
  civil_fine_type_id: z.string().uuid().nullable().optional(),
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
      // SAF-F18: qualify every filter with cf. — the driver-name LEFT JOIN below adds mdata.drivers,
      // which shares operating_company_id / deactivated_at, so unqualified columns would be ambiguous.
      const filters = ["cf.operating_company_id = $1", "cf.deactivated_at IS NULL"];
      const values: unknown[] = [q.operating_company_id];
      if (q.status) {
        values.push(q.status);
        filters.push(`cf.status = $${values.length}`);
      }
      if (q.subject_type) {
        values.push(q.subject_type);
        filters.push(`cf.subject_type = $${values.length}`);
      }
      if (q.subject_driver_id) {
        values.push(q.subject_driver_id);
        filters.push(`cf.subject_driver_id = $${values.length}`);
      }
      if (q.issued_date_from) {
        values.push(q.issued_date_from);
        filters.push(`cf.issued_date >= $${values.length}::date`);
      }
      if (q.issued_date_to) {
        values.push(q.issued_date_to);
        filters.push(`cf.issued_date <= $${values.length}::date`);
      }
      // SAF-F18: join the driver name server-side so the list + detail render a NAME, not a raw uuid.
      // mdata.drivers RLS is identity-based; withCompanyScope runs under the Lucia user, so the join
      // only sees drivers this user may access. The join is scoped by the fine's own entity too.
      const res = await client.query(
        `
          SELECT cf.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS subject_driver_name,
                 -- SAF-F19: the drawer now shows the related unit and load. Without these names the
                 -- links would render a truncated uuid as their label — the exact defect SAF-F18 and
                 -- SAF-F26 fixed on the driver/unit columns of the sibling lists.
                 u.unit_number  AS related_unit_number,
                 l.load_number  AS related_load_number
          FROM safety.civil_fines cf
          LEFT JOIN mdata.drivers d
            ON d.id = cf.subject_driver_id
           AND d.operating_company_id = cf.operating_company_id
          -- mdata.units has NO operating_company_id — scope by owner OR current lessee.
          LEFT JOIN mdata.units u
            ON u.id = cf.related_unit_id
           AND (u.owner_company_id = cf.operating_company_id
                OR u.currently_leased_to_company_id = cf.operating_company_id)
          LEFT JOIN mdata.loads l
            ON l.id = cf.related_load_id
           AND l.operating_company_id = cf.operating_company_id
          WHERE ${filters.join(" AND ")}
          ORDER BY cf.issued_date DESC, cf.created_at DESC
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
        // SAF-F18: same driver-name join so the detail drawer shows a name, not the raw uuid.
        `SELECT cf.*,
                NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS subject_driver_name
         FROM safety.civil_fines cf
         LEFT JOIN mdata.drivers d
           ON d.id = cf.subject_driver_id
          AND d.operating_company_id = cf.operating_company_id
         WHERE cf.id = $1 AND cf.operating_company_id = $2 LIMIT 1`,
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
            operating_company_id, subject_type, subject_driver_id, issued_by_authority, jurisdiction, violation_code, civil_fine_type_id,
            violation_description, issued_date, amount_cents, related_load_id, related_unit_id, source_doc_id, notes,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$13,$14,$15,$15
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
          body.data.civil_fine_type_id ?? null,
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

        // LAW: convert must seed canonical pending settlement deduction (REPAIR-A), not liability-only.
        // Apply-to-net stays behind SETTLEMENT_DEDUCTION_APPLY_ENABLED (owner flip). Seed is always on for amount > 0.
        let deductionId: string | null = null;
        if (amount > 0) {
          const deduction = await createSettlementDeduction(client, {
            driverId: String(fine.subject_driver_id),
            operatingCompanyId: query.data.operating_company_id,
            amountCents: amount,
            reason: `Civil fine recovery: ${String(fine.violation_description)}`,
            sourceType: "fine",
            loadId: fine.related_load_id ? String(fine.related_load_id) : null,
            createdByUserId: user.uuid,
          });
          deductionId = deduction.id;
        }

        const fineUpdateRes = await client.query(
          `
            UPDATE safety.civil_fines
            SET converted_to_liability_id = $2,
                converted_at = now(),
                converted_by_user_id = $3,
                updated_by_user_id = $3,
                driver_settlement_deduction_id = COALESCE($4, driver_settlement_deduction_id)
            WHERE id = $1
            RETURNING *
          `,
          [fine.id, liability.id, user.uuid, deductionId]
        );
        const updatedFine = fineUpdateRes.rows[0] as Record<string, unknown> | undefined;

        await appendCrudAudit(
          client,
          user.uuid,
          "safety.fine.converted_to_liability",
          {
            fine_id: fine.id,
            liability_id: liability.id,
            driver_settlement_deduction_id: deductionId,
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
          deduction_id: deductionId,
          message: deductionId
            ? "Fine converted to driver liability and pending settlement deduction seeded. Deduction applies on close when SETTLEMENT_DEDUCTION_APPLY_ENABLED is on."
            : "Fine converted to driver liability (zero amount — no deduction seeded).",
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
            AND voided_at IS NULL
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
            AND voided_at IS NULL
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

    const outcome = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      // OWNER RULING 2026-07-23 (Option B): a fine that has already been converted to a driver
      // liability may NOT be reduced in place. convertFineToLiability COPIES fine.amount_cents into
      // driver_finance.driver_liabilities — the two rows are not linked afterwards. Reducing the
      // fine alone therefore leaves the driver's liability at the ORIGINAL amount, and the driver is
      // deducted the full amount while the fine reads "reduced". That is a silent overcharge of a
      // real person's settlement.
      //
      // Industry standard is a hard block, not a silent cascade: QuickBooks refuses to edit
      // payment-bearing transactions in place, and the accepted workflow is to UNAPPLY the dependent
      // record first, then amend the source. NetSuite likewise dims fields on transactions that carry
      // dependents. We do the same and name the remedy in the error.
      const current = await client.query<{
        id: string;
        voided_at: string | null;
        converted_to_liability_id: string | null;
      }>(
        `
          SELECT id::text, voided_at, converted_to_liability_id::text
          FROM safety.civil_fines
          WHERE id = $1 AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const fine = current.rows[0];
      if (!fine) return { kind: "not_found" as const };
      if (fine.voided_at) return { kind: "voided" as const };
      if (fine.converted_to_liability_id) {
        return { kind: "converted" as const, liabilityId: fine.converted_to_liability_id };
      }

      const res = await client.query(
        `
          UPDATE safety.civil_fines
          SET amount_cents = $3,
              status = 'reduced',
              notes = COALESCE(notes || E'\n', '') || $4,
              updated_by_user_id = $5
          WHERE id = $1
            AND operating_company_id = $2
            AND voided_at IS NULL
            AND converted_to_liability_id IS NULL
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.amount_cents, body.data.reason, user.uuid]
      );
      const row = res.rows[0];
      // The predicate is repeated in the UPDATE so a concurrent convert/void between the SELECT and
      // the UPDATE cannot slip through — the read above is for the error message, not the gate.
      if (!row) return { kind: "conflict_race" as const };
      return { kind: "ok" as const, row };
    });

    if (outcome.kind === "not_found") return reply.code(404).send({ error: "fine_not_found" });
    if (outcome.kind === "voided") {
      return reply.code(409).send({
        error: "fine_voided",
        message: "This fine is voided. A voided record is immutable and cannot be reduced.",
      });
    }
    if (outcome.kind === "converted") {
      return reply.code(409).send({
        error: "fine_already_converted_to_liability",
        message:
          "This fine has already been converted to a driver liability, which holds its own copy of the " +
          "amount. Reducing the fine here would leave the driver owing the original amount. Reverse the " +
          "driver liability first, then reduce the fine and convert again.",
        driver_liability_id: outcome.liabilityId,
      });
    }
    if (outcome.kind === "conflict_race") {
      return reply.code(409).send({
        error: "fine_state_changed",
        message: "This fine was voided or converted to a liability while you were editing it. Reload and retry.",
      });
    }
    return outcome.row;
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

    // SAFETY FINE-GL HOP — the COMPANY-PAID leg. Linking a payment IS the moment the company eats the
    // fine: real cash left the bank. Before this, that fine reached NO ledger at all — the driver-recovery
    // treatment had a rail (convert-to-liability above) and the company-paid treatment had none.
    //
    // The poster is FLAG-GATED (SAFETY_FINE_GL_POSTING_ENABLED, default OFF => zero writes) and reuses
    // the shared accounting.createJournalEntry poster + the role resolver. It refuses any fine carrying
    // converted_to_liability_id (that is the driver's debt, not a company expense).
    //
    // Posting runs AFTER the fine row is committed and NEVER fails the payment link: the operational
    // record of the payment must survive even if the ledger leg is unresolvable (e.g. the owner has not
    // designated civil_fines_expense yet). The outcome is returned so the caller can see it, and any
    // error is surfaced on the response rather than swallowed silently.
    let expensePosting: Record<string, unknown>;
    try {
      expensePosting = await postCompanyPaidCivilFine({
        operating_company_id: query.data.operating_company_id,
        fine_id: params.data.id,
        entry_date_iso: body.data.paid_date,
        actor_user_id: user.uuid,
      });
    } catch (error) {
      req.log.error(
        { err: error, fine_id: params.data.id, operating_company_id: query.data.operating_company_id },
        "civil fine company-paid GL posting failed (payment link itself succeeded)"
      );
      expensePosting = {
        posted: false,
        reason: "posting_error",
        message: error instanceof Error ? error.message : String(error),
      };
    }

    return { ...updated, expense_posting: expensePosting };
  });
}
