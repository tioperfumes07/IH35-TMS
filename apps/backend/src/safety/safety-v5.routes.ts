import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { createWorkOrderWithLines } from "../maintenance/two-section-service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { createSettlementDeduction } from "../driver-finance/deductions.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

// SAF-F16 — driver-profile reverse view. Optional; absent = the existing company-wide list.
const internalFinesQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// SAF-F12 — internal fines had ONLY GET + POST, so a fine could be imposed on a driver and then
// never disputed or voided, even though safety.internal_fines.status accepts 'disputed'/'voided'
// and the table carries voided_at + voided_reason. A punitive record an operator cannot correct is
// a governance defect, not a missing nicety.
//
// Reason is REQUIRED on both transitions (void-cancel governance; min 3 matches the accounting void
// contract, the SAF-F11 complaint void, and VoidReasonModal's default).
const internalFineReasonBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
const internalFineIdParamsSchema = z.object({
  id: z.string().uuid(),
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
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function validateRole(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [role]);
    return fn(client);
  });
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

export async function registerSafetyV5Routes(app: FastifyInstance) {
  app.get("/api/v1/safety/v5/dot-inspections", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const inspections = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.dot_inspections WHERE operating_company_id = $1::uuid ORDER BY inspection_date DESC, created_at DESC LIMIT 500`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { inspections };
  });

  app.post("/api/v1/safety/v5/dot-inspections", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!validateRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = dotInspectionSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      if (body.data.driver_uuid) {
        const driver = await client.query(
          `SELECT id FROM mdata.drivers d
            WHERE d.id = $1::uuid
              AND d.archived_at IS NULL
              AND (d.operating_company_id = $2::uuid OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations dot_inspection_driver_dca
                 WHERE dot_inspection_driver_dca.driver_id = d.id
                   AND dot_inspection_driver_dca.company_id = $2::uuid
                   AND dot_inspection_driver_dca.is_authorized = true
                   AND dot_inspection_driver_dca.deactivated_at IS NULL
              ))
            LIMIT 1`,
          [body.data.driver_uuid, query.data.operating_company_id]
        );
        if (!driver.rows[0]) return { kind: "driver_not_found" as const };
      }
      if (body.data.unit_uuid) {
        const unit = await client.query(
          `SELECT id FROM mdata.units
            WHERE id = $1::uuid
              AND deactivated_at IS NULL
              AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
            LIMIT 1`,
          [body.data.unit_uuid, query.data.operating_company_id]
        );
        if (!unit.rows[0]) return { kind: "unit_not_found" as const };
      }
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
        const inspection = inspectionRes.rows[0] as Record<string, unknown> | undefined;
        if (!inspection?.id) throw new Error("safety_dot_inspection_insert_failed");
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
                service_item_uuid: (await client.query(`SELECT id FROM catalogs.items ORDER BY created_at LIMIT 1`)).rows[0]?.id,
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
          const linkedInspection = await client.query(
            `UPDATE safety.dot_inspections
                SET spawned_wo_id = $2
              WHERE id = $1
                AND operating_company_id = $3::uuid
                AND spawned_wo_id IS NULL`,
            [inspection.id, spawnedWo.woUuid, query.data.operating_company_id]
          );
          if ((linkedInspection.rowCount ?? linkedInspection.rows.length) !== 1) {
            throw new Error("dot_inspection_work_order_backlink_failed");
          }
          await appendCrudAudit(
            client,
            user.uuid,
            "safety.dot_inspection.spawned_wo",
            { operating_company_id: query.data.operating_company_id, inspection_id: inspection.id, spawned_wo_id: spawnedWo.woUuid },
            "warning",
            "P3-T11.17-TWO-SECTION-V5"
          );
        }
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.dot_inspection.created",
          { operating_company_id: query.data.operating_company_id, inspection_id: inspection.id, outcome: body.data.outcome, spawned_wo_id: spawnedWo?.woUuid ?? null },
          body.data.outcome === "OOS" ? "warning" : "info",
          "P3-T11.17-TWO-SECTION-V5"
        );
        return { kind: "ok" as const, inspection, spawned_wo: spawnedWo ? { uuid: spawnedWo.woUuid, display_id: spawnedWo.display_id } : null };
    });
    if (created.kind === "driver_not_found") return reply.code(404).send({ error: "mdata_driver_not_found" });
    if (created.kind === "unit_not_found") return reply.code(404).send({ error: "mdata_unit_not_found" });
    return reply.code(201).send({ inspection: created.inspection, spawned_wo: created.spawned_wo });
  });

  app.post("/api/v1/safety/internal-fines", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!validateRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = internalFineSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    // FD1 approval control: approving a fine instantly creates a recoverable driver liability (money
    // deducted from a real driver's settlement). QBO/NetSuite-grade control — any record that creates a
    // financial obligation must identify its approver in the audit trail. This validates the who-approved
    // side. It is now the ONLY acknowledgment control on this path: the insert below sets
    // requires_acknowledgment = FALSE, because the signed hire contract authorizes the deduction and
    // no per-charge driver e-sign exists (owner lock, legal/signed-finance-handoff.service.ts). That
    // makes this approver check load-bearing rather than belt-and-braces — do not weaken it.
    if (body.data.status === "approved" && !body.data.approved_by_user_uuid) {
      return reply.code(400).send({ error: "approver_required" });
    }

    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      // SAFETY-MONEY-F6822A: this callback used to open its own BEGIN/COMMIT/ROLLBACK here, nested
      // inside withCurrentUser's own transaction (auth/db.ts). Postgres has no real nested
      // transactions — a BEGIN while one is already open is a no-op WARNING, but the inner COMMIT
      // genuinely commits the OUTER transaction early, mid-handler. Every statement issued afterward
      // (the final "internal_fine.created" appendCrudAudit call below) then ran with no open
      // transaction and no SET LOCAL tenant GUC / forced app role (both are transaction-scoped in
      // withCurrentUser), so a failure there rolled back nothing — the fine, liability, and
      // settlement deduction stayed durably committed even though the request reported failure to
      // the caller. Removed the nested BEGIN/COMMIT/ROLLBACK; the wrapper's own single transaction
      // now owns the whole callback, matching every other route in this file.
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
              -- requires_acknowledgment = FALSE — see the accident path in safety.routes.ts. Signed
              -- HIRE CONTRACT authorizes the deduction (legal/signed-finance-handoff.service.ts,
              -- owner-LOCKED 2026-07-04/05); no per-charge driver e-sign. The approver check above
              -- (FD1, maker != checker) is the control that stays.
              VALUES ($1,$2,'internal_fine',$3,$4,$4,0,false,'internal_fine',$5,'pending_recovery')
              RETURNING *
            `,
            [
              query.data.operating_company_id,
              body.data.driver_uuid,
              `Internal fine ${fine.id}`,
              // body.data.amount is already DOLLARS (the line below converts it to cents for the
              // deduction). original_amount / current_balance are numeric(10,2) DOLLARS, so the *100
              // here was converting into the wrong unit and inflating the driver's debt 100x.
              Number(body.data.amount),
              fine.id,
            ]
          );
          liability = liabRes.rows[0] ?? null;
          if (liability) {
            const amountCents = Math.round(Number(body.data.amount) * 100);
            const deduction = await createSettlementDeduction(client, {
              driverId: body.data.driver_uuid,
              operatingCompanyId: query.data.operating_company_id,
              amountCents,
              reason: `Internal fine recovery: ${String(fine.id)}`,
              sourceType: "fine",
              loadId: body.data.related_load_uuid ?? null,
              createdByUserId: user.uuid,
            });
            // SAFETY-MONEY-F6741 — this UPDATE used to match by fine.id alone and ignore the
            // affected-row result, so a mismatch (wrong company, or a fine that already carries a
            // driver_liability_id) would leave the just-inserted liability + settlement deduction
            // as an orphan money recovery with no backlink, while the transaction still reported
            // success. Scope by company + driver_liability_id IS NULL and require exactly one row —
            // a mismatch throws here, which rolls back the whole transaction (including the
            // liability/deduction just inserted above) rather than committing an orphan.
            const fineLinked = await client.query(
              `UPDATE safety.internal_fines
                  SET status = 'converted_to_liability', driver_liability_id = $2
                WHERE id = $1
                  AND operating_company_id = $3::uuid
                  AND driver_liability_id IS NULL`,
              [fine.id, (liability as { id?: string }).id ?? null, query.data.operating_company_id]
            );
            if ((fineLinked.rowCount ?? 0) !== 1) {
              throw new Error("safety_internal_fine_liability_backlink_failed");
            }
            await appendCrudAudit(
              client,
              user.uuid,
              "safety.internal_fine.converted_to_liability",
              {
                operating_company_id: query.data.operating_company_id,
                internal_fine_id: fine.id,
                liability_id: (liability as { id?: string }).id ?? null,
                driver_settlement_deduction_id: deduction.id,
              },
              "warning",
              "P3-T11.17-TWO-SECTION-V5"
            );
          }
        }
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.internal_fine.created",
          { operating_company_id: query.data.operating_company_id, internal_fine_id: fine.id, status: body.data.status },
          "info",
          "P3-T11.17-TWO-SECTION-V5"
        );
        return { fine, liability };
    });
    return reply.code(201).send(created);
  });

  app.get(
    "/api/v1/safety/internal-fines",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    // SAF-F16: `driver_id` is filtered in SQL, not by the caller. The company list is capped at
    // LIMIT 500, so a client-side filter on that page would silently omit a driver's fines the
    // moment the company crosses 500 — a reverse view that quietly under-reports is worse than none.
    const query = internalFinesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const result = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      if (query.data.driver_id) {
        const parent = await client.query(
          `SELECT 1
           FROM mdata.drivers d
           WHERE d.id = $1::uuid
             AND d.archived_at IS NULL
             AND (
               d.operating_company_id = $2::uuid
               OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations dca
                 WHERE dca.driver_id = d.id
                   AND dca.company_id = $2::uuid
                   AND dca.is_authorized = true
                   AND dca.deactivated_at IS NULL
               )
             )
           LIMIT 1`,
          [query.data.driver_id, query.data.operating_company_id]
        );
        if (!parent.rows[0]) return { found: false as const, rows: [], total_count: 0 };
      }
      const values: unknown[] = [query.data.operating_company_id];
      let driverFilter = "";
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        driverFilter = `AND f.driver_id = $${values.length}`;
      }
      let loadFilter = "";
      if (query.data.load_id) {
        values.push(query.data.load_id);
        loadFilter = `AND f.related_load_id = $${values.length}`;
      }
      // CLS-UUID-LABEL: no driver join — InternalFinesPage's EntityLink rendered f.driver_id as a
      // raw full uuid with no label (same class as CLS-DOT-INSPECTIONS-UUID-LABEL). Mirrors the
      // safety.accident_reports/safety.dot_inspections driver join.
      const count = await client.query(
        `SELECT COUNT(*)::int AS total_count
           FROM safety.internal_fines f
          WHERE f.operating_company_id = $1::uuid
          ${driverFilter}
          ${loadFilter}`,
        values
      );
      const rowValues = [...values, query.data.limit, query.data.offset];
      const res = await client.query(
        `
          SELECT f.*, r.reason_code, r.reason_name,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name
          FROM safety.internal_fines f
          LEFT JOIN catalogs.internal_fine_reasons r ON r.id = f.reason_id
          LEFT JOIN mdata.drivers d
            ON d.id = f.driver_id
           AND (
             d.operating_company_id = f.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations label_dca
               WHERE label_dca.driver_id = d.id
                 AND label_dca.company_id = f.operating_company_id
                 AND label_dca.is_authorized = true
                 AND label_dca.deactivated_at IS NULL
             )
           )
          WHERE f.operating_company_id = $1::uuid
          ${driverFilter}
          ${loadFilter}
          ORDER BY f.imposed_date DESC, f.created_at DESC
          LIMIT $${rowValues.length - 1} OFFSET $${rowValues.length}
        `,
        rowValues
      );
      return { found: true as const, rows: res.rows, total_count: Number(count.rows[0]?.total_count ?? 0) };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { fines: result.rows, total_count: result.total_count };
    },
  );

  /**
   * SAF-F12 — dispute an internal fine (pending/approved -> disputed), reason required.
   *
   * A dispute is a state the driver is entitled to and the schema already allowed; there was simply
   * no way to reach it. It moves no money: an approved fine's driver_liability row is untouched, so
   * disputing never silently reverses a recovery. Voiding is the transition that must refuse when a
   * liability exists (below).
   */
  // Rate-limited per the repo pattern (config.rateLimit, cf. accounting/expenses.routes.ts).
  // 30/min: a state transition on a punitive record is an operator action, not a polling read.
  // CodeQL js/missing-rate-limiting flags an authorized route without it, and it is right to.
  app.patch(
    "/api/v1/safety/internal-fines/:id/dispute",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!validateRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = internalFineIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = internalFineReasonBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const outcome = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const current = await client.query(
        `SELECT id, status, voided_at FROM safety.internal_fines WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const row = current.rows[0];
      if (!row) return { kind: "not_found" as const };
      if (row.voided_at) return { kind: "voided" as const };
      if (row.status === "converted_to_liability") return { kind: "converted" as const };

      const res = await client.query(
        `
          UPDATE safety.internal_fines
          SET status = 'disputed',
              notes = COALESCE(notes || E'\\n', '') || 'DISPUTED: ' || $4
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
            AND status <> 'converted_to_liability'
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, user.uuid, body.data.reason]
      );
      const updated = res.rows[0];
      if (!updated) return { kind: "conflict_race" as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.internal_fine.disputed",
        { operating_company_id: query.data.operating_company_id, internal_fine_id: updated.id, reason: body.data.reason, previous_status: row.status },
        "warning",
        "SAF-F12-INTERNAL-FINE-LIFECYCLE"
      );
      return { kind: "ok" as const, row: updated };
    });

    if (outcome.kind === "not_found") return reply.code(404).send({ error: "internal_fine_not_found" });
    if (outcome.kind === "voided") {
      return reply.code(409).send({
        error: "internal_fine_voided",
        message: "This fine is voided. A voided record is immutable and cannot be disputed.",
      });
    }
    if (outcome.kind === "converted") {
      return reply.code(409).send({
        error: "internal_fine_already_converted_to_liability",
        message:
          "This fine has already been converted to a driver liability. Dispute the liability itself — " +
          "changing the fine here would not change what the driver owes.",
      });
    }
    if (outcome.kind === "conflict_race") {
      return reply.code(409).send({
        error: "internal_fine_state_changed",
        message: "This fine was voided or converted while you were editing it. Reload and retry.",
      });
    }
    return { fine: outcome.row };
  });

  /**
   * SAF-F12 — void an internal fine. Owner/Administrator only, reason required, void-not-delete
   * (voided_at + voided_reason; the row is never removed).
   *
   * OWNER RULING 2026-07-23 (amend BLOCKS, never cascades): a fine already converted to a
   * driver_finance.driver_liabilities row is REFUSED here, with the dependent liability id and the
   * remedy named in the error. Voiding the fine while the liability stands would leave the driver
   * owing money for a fine that no longer exists — the same silent-overcharge shape as the reduce
   * path fixed in #3341.
   */
  app.post(
    "/api/v1/safety/internal-fines/:id/void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = internalFineIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = internalFineReasonBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const outcome = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const current = await client.query(
        `SELECT id, status, voided_at, driver_liability_id
           FROM safety.internal_fines
          WHERE id = $1 AND operating_company_id = $2::uuid
          LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const row = current.rows[0];
      if (!row) return { kind: "not_found" as const };
      if (row.voided_at) return { kind: "already_voided" as const };
      if (row.driver_liability_id || row.status === "converted_to_liability") {
        return { kind: "converted" as const, liabilityId: row.driver_liability_id };
      }

      // The predicate is repeated in the UPDATE so a concurrent convert between the SELECT and the
      // UPDATE cannot slip through — the read above is for the error message, not the gate.
      const res = await client.query(
        `
          UPDATE safety.internal_fines
          SET status = 'voided', voided_at = now(), voided_reason = $3
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
            AND driver_liability_id IS NULL
            AND status <> 'converted_to_liability'
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.reason]
      );
      const updated = res.rows[0];
      if (!updated) return { kind: "conflict_race" as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.internal_fine.voided",
        { operating_company_id: query.data.operating_company_id, internal_fine_id: updated.id, void_reason: body.data.reason, previous_status: row.status },
        "warning",
        "SAF-F12-INTERNAL-FINE-LIFECYCLE"
      );
      return { kind: "ok" as const, row: updated };
    });

    if (outcome.kind === "not_found") return reply.code(404).send({ error: "internal_fine_not_found" });
    if (outcome.kind === "already_voided") {
      return reply.code(409).send({ error: "internal_fine_voided", message: "This fine is already voided." });
    }
    if (outcome.kind === "converted") {
      return reply.code(409).send({
        error: "internal_fine_already_converted_to_liability",
        message:
          "This fine has already been converted to a driver liability, which holds its own copy of the " +
          "amount. Voiding the fine here would leave the driver owing money for a fine that no longer " +
          "exists. Reverse the driver liability first, then void the fine.",
        driver_liability_id: outcome.liabilityId,
      });
    }
    if (outcome.kind === "conflict_race") {
      return reply.code(409).send({
        error: "internal_fine_state_changed",
        message: "This fine was voided or converted while you were editing it. Reload and retry.",
      });
    }
    return { fine: outcome.row };
  });

  app.post("/api/v1/safety/v5/complaints", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        { operating_company_id: query.data.operating_company_id, complaint_id: row.id, severity: row.severity, status: row.status },
        "warning",
        "P3-T11.17-TWO-SECTION-V5"
      );
      return row;
    });
    return reply.code(201).send({ complaint });
  });

  app.get("/api/v1/safety/v5/complaints", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
          WHERE c.operating_company_id = $1::uuid
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
