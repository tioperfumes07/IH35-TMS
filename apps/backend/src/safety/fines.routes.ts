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
  related_load_id: z.string().uuid().optional(),
  related_unit_id: z.string().uuid().optional(),
  issued_date_from: z.string().optional(),
  issued_date_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

export async function registerSafetyFinesRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/fines", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = finesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const result = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      if (q.subject_driver_id) {
        const parent = await client.query(
          `SELECT 1
             FROM mdata.drivers d
            WHERE d.id = $1::uuid
              AND d.archived_at IS NULL
              AND (
                d.operating_company_id = $2::uuid
                OR EXISTS (
                  SELECT 1
                    FROM mdata.driver_company_authorizations dca
                   WHERE dca.driver_id = d.id
                     AND dca.company_id = $2::uuid
                     AND dca.is_authorized = true
                     AND dca.deactivated_at IS NULL
                )
              )
            LIMIT 1`,
          [q.subject_driver_id, q.operating_company_id]
        );
        if (!parent.rows[0]) return { found: false, rows: [], total_count: 0 };
      }
      // SAF-F18: qualify every filter with cf. — the driver-name LEFT JOIN below adds mdata.drivers,
      // which shares operating_company_id / deactivated_at, so unqualified columns would be ambiguous.
      const filters = ["cf.operating_company_id = $1::uuid", "cf.deactivated_at IS NULL"];
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
      if (q.related_load_id) {
        values.push(q.related_load_id);
        filters.push(`cf.related_load_id = $${values.length}`);
      }
      if (q.related_unit_id) {
        values.push(q.related_unit_id);
        filters.push(`cf.related_unit_id = $${values.length}`);
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
      const count = await client.query<{ total_count: number }>(
        `SELECT COUNT(*)::int AS total_count
           FROM safety.civil_fines cf
          WHERE ${filters.join(" AND ")}`,
        values
      );
      const rowValues = [...values, q.limit, q.offset];
      const res = await client.query(
        `
          SELECT cf.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS subject_driver_name,
                 -- SAF-F19: the drawer now shows the related unit and load. Without these names the
                 -- links would render a truncated uuid as their label — the exact defect SAF-F18 and
                 -- SAF-F26 fixed on the driver/unit columns of the sibling lists.
                 u.unit_number  AS related_unit_number,
                 l.load_number  AS related_load_number,
                 -- gl_je column-wave (2026-08-12): the company-paid expense leg posts
                 -- accounting.civil_fine_postings.expense_je_id via poster.service.ts, but that id
                 -- was never joined back into any GET — it existed for exactly one HTTP response (the
                 -- link-payment POST) and was then unreachable. Same reverse-JOIN shape as
                 -- bills.service.ts's bill-payment JE link (no FK column on the source row itself).
                 cfp.expense_je_id::text AS journal_entry_id
          FROM safety.civil_fines cf
          LEFT JOIN mdata.drivers d
            ON d.id = cf.subject_driver_id
           AND (
             d.operating_company_id = cf.operating_company_id
             OR EXISTS (
               SELECT 1
                 FROM mdata.driver_company_authorizations label_dca
                WHERE label_dca.driver_id = d.id
                  AND label_dca.company_id = cf.operating_company_id
                  AND label_dca.is_authorized = true
                  AND label_dca.deactivated_at IS NULL
             )
           )
          -- mdata.units has NO operating_company_id — scope by owner OR current lessee.
          LEFT JOIN mdata.units u
            ON u.id = cf.related_unit_id
           AND (u.owner_company_id = cf.operating_company_id
                OR u.currently_leased_to_company_id = cf.operating_company_id)
          LEFT JOIN mdata.loads l
            ON l.id = cf.related_load_id
           AND l.operating_company_id = cf.operating_company_id
          LEFT JOIN accounting.civil_fine_postings cfp
            ON cfp.fine_id = cf.id
           AND cfp.operating_company_id = cf.operating_company_id
           AND cfp.is_active
          WHERE ${filters.join(" AND ")}
          ORDER BY cf.issued_date DESC, cf.created_at DESC
          LIMIT $${rowValues.length - 1} OFFSET $${rowValues.length}
        `,
        rowValues
      );
      return { found: true, rows: res.rows, total_count: count.rows[0]?.total_count ?? 0 };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { fines: result.rows, total_count: result.total_count };
  });

  app.get("/api/v1/safety/fines/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        // SAF-F18: same driver-name join so the detail drawer shows a name, not the raw uuid.
        // gl_je column-wave (2026-08-12): same reverse-JOIN to accounting.civil_fine_postings as the
        // list query above — see that comment for why this can't be a stored FK on civil_fines.
        `SELECT cf.*,
                NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS subject_driver_name,
                u.unit_number AS related_unit_number,
                l.load_number AS related_load_number,
                cfp.expense_je_id::text AS journal_entry_id
         FROM safety.civil_fines cf
         LEFT JOIN mdata.drivers d
           ON d.id = cf.subject_driver_id
          AND (
            d.operating_company_id = cf.operating_company_id
            OR EXISTS (
              SELECT 1
                FROM mdata.driver_company_authorizations label_dca
               WHERE label_dca.driver_id = d.id
                 AND label_dca.company_id = cf.operating_company_id
                 AND label_dca.is_authorized = true
                 AND label_dca.deactivated_at IS NULL
            )
          )
         LEFT JOIN mdata.units u
           ON u.id = cf.related_unit_id
          AND (u.owner_company_id = cf.operating_company_id OR u.currently_leased_to_company_id = cf.operating_company_id)
         LEFT JOIN mdata.loads l
           ON l.id = cf.related_load_id
          AND l.operating_company_id = cf.operating_company_id
         LEFT JOIN accounting.civil_fine_postings cfp
           ON cfp.fine_id = cf.id
          AND cfp.operating_company_id = cf.operating_company_id
          AND cfp.is_active
         WHERE cf.id = $1 AND cf.operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "fine_not_found" });
    return row;
  });

  app.post("/api/v1/safety/fines", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = createFineBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const fine = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const links = await client.query<{
        driver_ok: boolean;
        load_ok: boolean;
        unit_ok: boolean;
        type_ok: boolean;
        document_ok: boolean;
      }>(
        `SELECT
           ($2::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.drivers d
             WHERE d.id = $2::uuid
               AND (d.operating_company_id = $1::uuid OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations fine_create_driver_dca
                 WHERE fine_create_driver_dca.driver_id = d.id
                   AND fine_create_driver_dca.company_id = $1::uuid
                   AND fine_create_driver_dca.is_authorized = true
                   AND fine_create_driver_dca.deactivated_at IS NULL
               ))
           )) AS driver_ok,
           ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = $3::uuid AND l.operating_company_id = $1::uuid)) AS load_ok,
           ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM mdata.units u WHERE u.id = $4::uuid AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid))) AS unit_ok,
           ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM catalogs.civil_fine_types cft WHERE cft.id = $5::uuid AND cft.operating_company_id = $1::uuid)) AS type_ok,
           ($6::uuid IS NULL OR EXISTS (SELECT 1 FROM docs.files f WHERE f.id = $6::uuid AND f.operating_company_id = $1::uuid)) AS document_ok`,
        [
          query.data.operating_company_id,
          body.data.subject_driver_id ?? null,
          body.data.related_load_id ?? null,
          body.data.related_unit_id ?? null,
          body.data.civil_fine_type_id ?? null,
          body.data.source_doc_id ?? null,
        ]
      );
      const integrity = links.rows[0];
      if (!integrity || Object.values(integrity).some((value) => value !== true)) return null;
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
            subject_driver_id: created.subject_driver_id,
            related_load_id: created.related_load_id,
            related_unit_id: created.related_unit_id,
            civil_fine_type_id: created.civil_fine_type_id,
            source_doc_id: created.source_doc_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return created;
    });
    if (!fine) return reply.code(400).send({ error: "related_entity_not_in_operating_company" });
    return reply.code(201).send(fine);
  });

  app.patch("/api/v1/safety/fines/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $${values.length}::uuid
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

  // Rate-limited per the repo pattern (config.rateLimit, cf. accounting/expenses.routes.ts). 30/min:
  // this writes a driver debt, so it sits with the other money-mutating routes, not the read tier.
  app.post("/api/v1/safety/fines/:id/convert-to-liability", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
              AND operating_company_id = $2::uuid
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
          `SELECT id, status FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
          [fine.subject_driver_id, query.data.operating_company_id]
        );
        const driver = driverRes.rows[0] as Record<string, unknown> | undefined;
        if (!driver || String(driver.status ?? "").toLowerCase() !== "active") {
          await client.query("ROLLBACK");
          return { code: 422 as const, error: "driver_not_active" };
        }

        // TWO units, deliberately two names. `amount` stays CENTS because createSettlementDeduction
        // below takes amountCents (and requires an integer) — that path was always correct and must
        // not move. `amountDollars` exists only for driver_liabilities.original_amount /
        // current_balance, which are numeric(10,2) DOLLARS (cash-advance-create.ts writes dollars;
        // fuel-posting/poster.service.ts reads them back with *100). Passing cents into those columns
        // made a $1,000 fine read as a $100,000 debt against the driver.
        const amount = Number(fine.amount_cents ?? 0);
        const amountDollars = amount / 100;
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
              -- requires_acknowledgment = FALSE — see the accident path in safety.routes.ts. The
              -- authorizing document is the signed HIRE CONTRACT (legal/signed-finance-handoff.service.ts,
              -- owner-LOCKED 2026-07-04/05), not a per-charge driver e-sign. Company sign-off at
              -- settlement prep (MUST 3.4.2 d/e) + maker != checker (F13) remain the controls.
              $1,$2,'civil_fine',$3,$4,$4,0,false,'safety_fine',$5,$6,'pending_recovery'
            )
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            fine.subject_driver_id,
            `Fine: ${String(fine.violation_description)} (${String(fine.issued_by_authority)} ${String(fine.jurisdiction ?? "")})`,
            amountDollars,
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

  app.post("/api/v1/safety/fines/:id/contest", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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

  app.post("/api/v1/safety/fines/:id/dismiss", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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

  app.post("/api/v1/safety/fines/:id/reduce", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
          WHERE id = $1 AND operating_company_id = $2::uuid
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
            AND operating_company_id = $2::uuid
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

  app.post("/api/v1/safety/fines/:id/link-payment", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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
