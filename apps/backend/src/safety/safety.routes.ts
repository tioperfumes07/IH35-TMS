import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listSafetyEvents } from "./safety.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { INTERNAL_CSA_SOURCE_METADATA } from "../routes/safety/csa-scores.js";
import { EXCLUDE_ARCHIVED_DRIVERS_SQL } from "../mdata/test-seed-archive.js";
import { EXCLUDE_PSEUDO_DRIVERS_SQL } from "../mdata/driver-pseudo-user.js";
import { createSettlementDeduction } from "../driver-finance/deductions.service.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { randomUUID } from "node:crypto";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

// SAF-F17 — unit-profile reverse view. Optional; absent = the existing company-wide list.
// SAF-C01 — load-detail reverse view: filter by load_id in SQL (LIMIT 500 — never client-filter).
const accidentsQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  // RANK5-ACCIDENT-TRAILER-ID — safety.accident_reports.trailer_id, live since rank 1 (PR #6316).
  trailer_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const trainingCompletionsQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const eventsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  filter: z.enum(["active", "resolved", "all"]).default("active"),
  window: z.enum(["7d", "10d", "30d", "90d", "all"]).default("7d"),
  event_type: z.string().optional(),
  severity: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const statusBodySchema = z.object({
  status: z.enum(["open", "under-investigation", "closed-no-fault", "closed-driver-at-fault"]),
});

// SC1: office-created accident reports. The safety officer / office CAN create a report from the
// computer (not view-only) and link it to the real Driver + Unit + Repair Vendor + Load records.
const nullableUuid = z.string().uuid().nullish();
// SAFE-1: carrier fault determination (three real states) + DOT/FMCSA preventability. at_fault mirrors
// the drawer's three options; preventable is a distinct boolean (true=Preventable, false=Not
// Preventable, null=Undetermined). Both nullish so an unassessed report persists as NULL, never a
// false default.
const atFaultEnum = z.enum(["yes", "no", "disputed"]).nullish();
const preventableFlag = z.boolean().nullish();
// SAF-F05: the drawer rendered these 7 fields but discarded them on save (no columns existed). They
// are standard accident-report evidence (police report #, external insurer claim #, location, 3rd
// party, vendor invoice, bill/expense ref) — persisted via migration 202607810000. All free-text and
// nullish so an unfilled field stays NULL.
const accidentTextField = z.string().max(200).nullish();
const accidentCostLineSchema = z.object({
  section: z.enum(["A", "B"]),
  description: z.string().max(2000).optional().default(""),
  amount_cents: z.number().int().optional().default(0),
  sort_order: z.number().int().optional(),
});
const createAccidentBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  accident_type_id: z.string().uuid(),
  driver_id: nullableUuid,
  unit_id: nullableUuid,
  // RANK5-ACCIDENT-TRAILER-ID — trip-wiring rank 5: physical trailer (mdata.equipment) involved,
  // independent of the tractor (unit_id). Live FK since rank 1 (PR #6316).
  trailer_id: nullableUuid,
  vendor_id: nullableUuid,
  load_id: nullableUuid,
  accident_at: z.string().min(1).nullish(),
  description: z.string().nullish(),
  at_fault: atFaultEnum,
  preventable: preventableFlag,
  police_report_number: accidentTextField,
  insurance_claim_number: accidentTextField,
  location: accidentTextField,
  third_party_name: accidentTextField,
  third_party_plate: accidentTextField,
  vendor_invoice_number: accidentTextField,
  bill_or_expense_ref: accidentTextField,
  // C9 (HOLD migration 202609180000)
  record_type: z.enum(["accident", "damage", "vandalism"]).nullish(),
  service_type: z.enum(["repair", "replacement", "tow"]).nullish(),
  report_date: z.string().min(1).nullish(),
  tax_rate_pct: z.number().min(0).max(100).nullish(),
  cost_lines: z.array(accidentCostLineSchema).optional().default([]),
});
const patchAccidentBodySchema = z.object({
  accident_type_id: z.string().uuid().optional(),
  driver_id: nullableUuid,
  unit_id: nullableUuid,
  trailer_id: nullableUuid,
  vendor_id: nullableUuid,
  load_id: nullableUuid,
  accident_at: z.string().min(1).nullish(),
  description: z.string().nullish(),
  at_fault: atFaultEnum,
  preventable: preventableFlag,
  police_report_number: accidentTextField,
  insurance_claim_number: accidentTextField,
  location: accidentTextField,
  third_party_name: accidentTextField,
  third_party_plate: accidentTextField,
  vendor_invoice_number: accidentTextField,
  bill_or_expense_ref: accidentTextField,
  record_type: z.enum(["accident", "damage", "vandalism"]).nullish(),
  service_type: z.enum(["repair", "replacement", "tow"]).nullish(),
  report_date: z.string().min(1).nullish(),
  tax_rate_pct: z.number().min(0).max(100).nullish(),
  cost_lines: z.array(accidentCostLineSchema).optional(),
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

type AccidentLinkInput = {
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  vendor_id?: string | null;
  load_id?: string | null;
};

async function missingAccidentCompanyLinks(
  client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  },
  operatingCompanyId: string,
  links: AccidentLinkInput,
): Promise<string[]> {
  const checks = [
    ["driver_id", links.driver_id, `SELECT 1 FROM mdata.drivers d WHERE d.id = $1::uuid AND d.archived_at IS NULL AND (d.operating_company_id = $2::uuid OR EXISTS (SELECT 1 FROM mdata.driver_company_authorizations dca WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid AND dca.is_authorized = true AND dca.deactivated_at IS NULL))`],
    ["unit_id", links.unit_id, `SELECT 1 FROM mdata.units u WHERE u.id = $1::uuid AND (u.owner_company_id = $2::uuid OR u.currently_leased_to_company_id = $2::uuid)`],
    ["trailer_id", links.trailer_id, `SELECT 1 FROM mdata.equipment e WHERE e.id = $1::uuid AND (e.owner_company_id = $2::uuid OR e.currently_leased_to_company_id = $2::uuid)`],
    ["vendor_id", links.vendor_id, `SELECT 1 FROM mdata.vendors v WHERE v.id = $1::uuid AND v.operating_company_id = $2::uuid`],
    ["load_id", links.load_id, `SELECT 1 FROM mdata.loads l WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`],
  ] as const;
  const missing: string[] = [];
  for (const [field, id, sql] of checks) {
    if (!id) continue;
    const found = await client.query(sql, [id, operatingCompanyId]);
    if (!found.rows[0]) missing.push(field);
  }
  return missing;
}

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

/** Durable token embedded in WO.description so spawn-wo can find prior AC WOs without a FK column. */
function accidentSpawnDescription(accidentId: string): string {
  return `Auto-created from accident report ${accidentId}. Fill external vendor WO/invoice fields before completion.`;
}

type SpawnedWoRow = { id: string; display_id: string | null };

async function listAccidentSpawnedWorkOrders(
  client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  },
  operatingCompanyId: string,
  accidentId: string
): Promise<SpawnedWoRow[]> {
  // Match the full token OR a bare accident uuid (covers any prior wording that still carried the id).
  const res = await client.query<SpawnedWoRow>(
    `
      SELECT id::text AS id, display_id
      FROM maintenance.work_orders
      WHERE operating_company_id = $1::uuid
        AND source_type = 'AC'
        AND voided_at IS NULL
        AND description ILIKE '%' || $2 || '%'
      ORDER BY opened_at ASC NULLS LAST, created_at ASC
    `,
    [operatingCompanyId, accidentId]
  );
  return res.rows;
}

export async function registerSafetyRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/dashboard/kpis", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      // SAFETY-KPI-WIRED: every tile SafetyKpiRow renders is computed here from its real source.
      //
      // Why this is not read from views.safety_dashboard_kpis: migration 0045 creates that view
      // conditionally — real aggregate IF safety.safety_events already exists, else a
      // `SELECT ... WHERE false` stub. safety_events did not exist when 0045 ran, so the STUB was
      // installed and nothing ever recreated it. On prod the view returns zero rows for every
      // entity, which rendered the whole dashboard as 0 while the fleet had 83 active drivers.
      // The 0045 "real" branch also selects event_at, a column safety.safety_events does not have
      // (it is occurred_at), so re-running that branch would fail. The view is left in place
      // (additive-only); this route simply stops depending on it.
      //
      // No .catch() fallbacks here on purpose: a swallowed error rendered identically to real
      // zeros, which is what hid this defect. If a source is unavailable the endpoint must fail
      // loudly rather than report a false all-clear on a safety screen.
      const kpiRes = await client.query<{
        open_events: number;
        mtd_violations: number;
        training_due_30d: number;
        active_drivers: number;
        drivers_with_open_fines: number;
        open_company_violations: number;
        critical_integrity_alerts: number;
        open_liabilities: number;
        pending_acknowledgments: number;
      }>(
        `
          SELECT
            (SELECT COUNT(*)::int FROM safety.safety_events
              WHERE operating_company_id = $1::uuid AND status = 'open') AS open_events,
            (SELECT COUNT(*)::int FROM safety.safety_events
              WHERE operating_company_id = $1::uuid
                AND occurred_at >= date_trunc('month', now())) AS mtd_violations,
            (SELECT COUNT(*)::int FROM safety.safety_events
              WHERE operating_company_id = $1::uuid
                AND event_type = 'training_due'
                AND occurred_at <= now() + INTERVAL '30 days') AS training_due_30d,
            -- Must agree with the canonical Drivers list (/api/v1/mdata/drivers?status=Active),
            -- which is what an operator cross-checks this tile against. That list filters on the
            -- driver STATUS plus the archived/pseudo/is_sample_data exclusions — NOT on
            -- deactivated_at. Using a different predicate here produced 83 vs the list's 82 and
            -- would reintroduce exactly the kind of number-disagreement this fix exists to remove.
            -- HOME-FLEET-UTILIZATION-F4583 class (2026-08-24): this tile was still missing the
            -- is_sample_data half of that parity — live-measured 80 here vs 79 on the canonical
            -- list (drivers.routes.ts already filters is_sample_data IS NOT TRUE, #14909).
            (SELECT COUNT(*)::int FROM mdata.drivers
              WHERE operating_company_id = $1::uuid
                AND status = 'Active'
                AND ${EXCLUDE_ARCHIVED_DRIVERS_SQL}
                AND ${EXCLUDE_PSEUDO_DRIVERS_SQL}
                AND is_sample_data IS NOT TRUE) AS active_drivers,
            (SELECT COUNT(DISTINCT driver_id)::int FROM (
                SELECT subject_driver_id AS driver_id
                FROM safety.civil_fines
                WHERE operating_company_id = $1::uuid
                  AND subject_driver_id IS NOT NULL
                  AND status IN ('open', 'contested')
                  AND voided_at IS NULL
                  AND deactivated_at IS NULL
                UNION
                SELECT driver_id
                FROM safety.internal_fines
                WHERE operating_company_id = $1::uuid
                  AND driver_id IS NOT NULL
                  AND status IN ('pending', 'approved', 'disputed')
                  AND voided_at IS NULL
              ) AS open_fine_drivers) AS drivers_with_open_fines,
            (SELECT COUNT(*)::int FROM safety.company_violations
              WHERE operating_company_id = $1::uuid
                AND status IN ('open', 'in_progress', 'escalated')
                AND deactivated_at IS NULL) AS open_company_violations,
            (SELECT COUNT(*)::int FROM safety.integrity_alerts
              WHERE operating_company_id = $1::uuid
                AND lower(severity) = 'critical'
                AND resolution_status IN ('unresolved', 'investigating')
                AND (snoozed_until IS NULL OR snoozed_until <= now())) AS critical_integrity_alerts,
            (SELECT COUNT(*)::int FROM driver_finance.driver_liabilities
              WHERE operating_company_id = $1::uuid
                AND current_balance > 0) AS open_liabilities,
            (SELECT COUNT(*)::int FROM views.liabilities_active_with_context
              WHERE operating_company_id = $1::uuid
                AND requires_acknowledgment = true
                AND acknowledgment_uuid IS NULL) AS pending_acknowledgments
        `,
        [companyId]
      );
      const testsRes = await client.query<{ count: number }>(
          `
            SELECT COUNT(*)::int AS count
            FROM safety.drug_test
            WHERE operating_company_id = $1::uuid
              AND test_date >= date_trunc('year', now())
              AND voided_at IS NULL
          `,
          [companyId]
        );
      const csaRes = await client.query<{ score: number | null }>(
          `
            SELECT CASE
              WHEN num_nonnulls(
                basic_unsafe_driving,
                basic_hos_compliance,
                basic_driver_fitness,
                basic_controlled_substances,
                basic_vehicle_maintenance,
                basic_crash_indicator
              ) = 0 THEN NULL
              ELSE (
                COALESCE(basic_unsafe_driving, 0)
                + COALESCE(basic_hos_compliance, 0)
                + COALESCE(basic_driver_fitness, 0)
                + COALESCE(basic_controlled_substances, 0)
                + COALESCE(basic_vehicle_maintenance, 0)
                + COALESCE(basic_crash_indicator, 0)
              )::numeric
            END AS score
            FROM safety.csa_scores
            WHERE operating_company_id = $1::uuid
            ORDER BY computed_at DESC
            LIMIT 1
          `,
          [companyId]
        );
      const k = kpiRes.rows[0];
      const pendingAcknowledgments = Number(k?.pending_acknowledgments ?? 0);
      return {
        operating_company_id: companyId,
        open_events: Number(k?.open_events ?? 0),
        mtd_violations: Number(k?.mtd_violations ?? 0),
        training_due_30d: Number(k?.training_due_30d ?? 0),
        // The six tiles SafetyKpiRow renders. These keys must match that component exactly —
        // it previously bound field names this endpoint never returned, so each resolved
        // `undefined ?? 0` and every tile read 0 regardless of real data.
        active_drivers: Number(k?.active_drivers ?? 0),
        drivers_with_open_fines: Number(k?.drivers_with_open_fines ?? 0),
        open_company_violations: Number(k?.open_company_violations ?? 0),
        critical_integrity_alerts: Number(k?.critical_integrity_alerts ?? 0),
        open_liabilities: Number(k?.open_liabilities ?? 0),
        pending_acknowledgments: pendingAcknowledgments,
        // pending_acks kept for back-compat: SafetyKpiRow falls back to it, and it was the only
        // tile key this endpoint ever emitted.
        pending_acks: pendingAcknowledgments,
        da_tests_ytd: Number(testsRes.rows[0]?.count ?? 0),
        csa_score_latest:
          csaRes.rows[0]?.score == null ? null : Number(csaRes.rows[0].score),
        csa_source: INTERNAL_CSA_SOURCE_METADATA,
      };
    });
    return payload;
  });

  app.get("/api/v1/safety/events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = eventsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const payload = await listSafetyEvents(user.uuid, q);
    return payload;
  });

  app.get("/api/v1/safety/events/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
          `
            SELECT *
            FROM views.safety_events_with_driver
            WHERE id = $1
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, query.data.operating_company_id]
        );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "safety_event_not_found" });
    return row;
  });

  app.get("/api/v1/safety/training/completions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = trainingCompletionsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      // CLS-UUID-LABEL: no driver join — TrainingRecordsPage's EntityLink rendered tr.driver_id
      // as a raw full uuid with no label (same class fixed on accidents/dot_inspections/internal_fines).
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
      const driverFilter = query.data.driver_id ? "AND tr.driver_id = $2::uuid" : "";
      if (query.data.driver_id) values.push(query.data.driver_id);
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count
         FROM safety.training_records tr
         WHERE tr.operating_company_id = $1::uuid
           AND tr.voided_at IS NULL
           ${driverFilter}`,
        values
      );
      values.push(query.data.limit, query.data.offset);
      const res = await client.query(
          `
            SELECT tr.*,
                   NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name
            FROM safety.training_records tr
            LEFT JOIN mdata.drivers d
              ON d.id = tr.driver_id
             AND (
               d.operating_company_id = tr.operating_company_id
               OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations label_dca
                 WHERE label_dca.driver_id = d.id
                   AND label_dca.company_id = tr.operating_company_id
                   AND label_dca.is_authorized = true
                   AND label_dca.deactivated_at IS NULL
               )
             )
            WHERE tr.operating_company_id = $1::uuid
              AND tr.voided_at IS NULL
              ${driverFilter}
            ORDER BY tr.completed_at DESC
            LIMIT $${values.length - 1} OFFSET $${values.length}
          `,
          values
        );
      return { found: true as const, rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { training_completions: result.rows, total_count: result.total_count };
  });

  app.get("/api/v1/safety/drug-alcohol/tests", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM safety.drug_test
            WHERE operating_company_id = $1::uuid
              AND voided_at IS NULL
            ORDER BY test_date DESC
            LIMIT 500
          `,
          [query.data.operating_company_id]
        );
      return res.rows;
    });
    return { tests: rows };
  });

  app.get(
    "/api/v1/safety/accidents",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // SAF-F17: optional unit scoping for the unit profile's reverse safety section. Filtered in SQL
    // because this list is capped at LIMIT 500 — a client-side filter would silently omit a unit's
    // accidents once the company crosses that cap. `safety.accident_reports` gained `trailer_id` in
    // rank 1 (PR #6316) — mirrored below with the same filter/join/display-column treatment as unit_id.
    const query = accidentsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      // SAF-F26: join the driver NAME and unit NUMBER so the list drills through by name, not a raw
      // uuid. driver join is entity-scoped; the unit join is scoped by owner/lessee because mdata.units
      // has NO operating_company_id (owner_company_id / currently_leased_to_company_id). The former
      // `.catch(() => [])` swallow is removed — a failed accidents query must surface, not render as an
      // empty "no accidents" all-clear on a safety screen (the same fake-green class as SAF-F06).
      const values: unknown[] = [query.data.operating_company_id];
      const scopeFilters: string[] = [];
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
        values.push(query.data.driver_id);
        scopeFilters.push(`AND ar.driver_id = $${values.length}`);
      }
      if (query.data.unit_id) {
        values.push(query.data.unit_id);
        scopeFilters.push(`AND ar.unit_id = $${values.length}`);
      }
      if (query.data.trailer_id) {
        values.push(query.data.trailer_id);
        scopeFilters.push(`AND ar.trailer_id = $${values.length}`);
      }
      if (query.data.load_id) {
        values.push(query.data.load_id);
        scopeFilters.push(`AND ar.load_id = $${values.length}`);
      }
      if (query.data.from) {
        values.push(query.data.from);
        scopeFilters.push(`AND ar.accident_at >= $${values.length}::date`);
      }
      if (query.data.to) {
        values.push(query.data.to);
        scopeFilters.push(`AND ar.accident_at < ($${values.length}::date + INTERVAL '1 day')`);
      }
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total_count
         FROM safety.accident_reports ar
         WHERE ar.operating_company_id = $1::uuid
         ${scopeFilters.join("\n         ")}`,
        values
      );
      values.push(query.data.limit, query.data.offset);
      const res = await client.query(
        `
          SELECT ar.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                 u.unit_number AS unit_number,
                 tr.equipment_number AS trailer_number,
                 l.load_number AS load_number,
                 v.vendor_name AS vendor_name,
                 claim.claim_id,
                 claim.claim_number
          FROM safety.accident_reports ar
          LEFT JOIN mdata.drivers d
            ON d.id = ar.driver_id
           AND (
             d.operating_company_id = ar.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations label_dca
               WHERE label_dca.driver_id = d.id
                 AND label_dca.company_id = ar.operating_company_id
                 AND label_dca.is_authorized = true
                 AND label_dca.deactivated_at IS NULL
             )
           )
          LEFT JOIN mdata.units u
            ON u.id = ar.unit_id
           AND (u.owner_company_id = ar.operating_company_id
                OR u.currently_leased_to_company_id = ar.operating_company_id)
          LEFT JOIN mdata.equipment tr
            ON tr.id = ar.trailer_id
           AND (tr.owner_company_id = ar.operating_company_id
                OR tr.currently_leased_to_company_id = ar.operating_company_id)
          -- SAF-B25: safety.accident_reports.load_id has FKed mdata.loads since it was created, and
          -- the list never joined it — so an accident could not be read against the trip it happened
          -- on. Entity-scoped like the driver join. A soft-deleted load still resolves its number:
          -- hiding it would silently blank the linkage on exactly the historical accidents an
          -- insurer or attorney is most likely to be reading.
          LEFT JOIN mdata.loads l
            ON l.id = ar.load_id
           AND l.operating_company_id = ar.operating_company_id
          -- Same gap on the vendor leg: the creator captures vendor_id (the tow/repair counterparty)
          -- and the list never resolved it either, so the accident could not be read against the
          -- party that billed for it.
          LEFT JOIN mdata.vendors v
            ON v.id = ar.vendor_id
           AND v.operating_company_id = ar.operating_company_id
          -- C-02: reverse of ClaimsTab forward accident link
          LEFT JOIN LATERAL (
            SELECT c.id AS claim_id, c.claim_number AS claim_number
            FROM insurance.claim c
            WHERE c.accident_report_id = ar.id
              AND c.operating_company_id = ar.operating_company_id
            ORDER BY c.created_at DESC
            LIMIT 1
          ) claim ON true
          WHERE ar.operating_company_id = $1::uuid
          ${scopeFilters.join("\n          ")}
          ORDER BY ar.accident_at DESC
          LIMIT $${values.length - 1}::int OFFSET $${values.length}::int
        `,
        values
      );
      return { found: true as const, rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { accidents: result.rows, total_count: result.total_count };
  });

  app.get("/api/v1/safety/accidents/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT ar.*,
                   NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                   u.unit_number,
                   tr.equipment_number AS trailer_number,
                   l.load_number,
                   v.vendor_name
            FROM safety.accident_reports ar
            LEFT JOIN mdata.drivers d
              ON d.id = ar.driver_id
             AND (
               d.operating_company_id = ar.operating_company_id
               OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations detail_dca
                 WHERE detail_dca.driver_id = d.id
                   AND detail_dca.company_id = ar.operating_company_id
                   AND detail_dca.is_authorized = true
                   AND detail_dca.deactivated_at IS NULL
               )
             )
            LEFT JOIN mdata.units u
              ON u.id = ar.unit_id
             AND (u.owner_company_id = ar.operating_company_id
                  OR u.currently_leased_to_company_id = ar.operating_company_id)
            LEFT JOIN mdata.equipment tr
              ON tr.id = ar.trailer_id
             AND (tr.owner_company_id = ar.operating_company_id
                  OR tr.currently_leased_to_company_id = ar.operating_company_id)
            LEFT JOIN mdata.loads l
              ON l.id = ar.load_id
             AND l.operating_company_id = ar.operating_company_id
            LEFT JOIN mdata.vendors v
              ON v.id = ar.vendor_id
             AND v.operating_company_id = ar.operating_company_id
            WHERE ar.id = $1
              AND ar.operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, query.data.operating_company_id]
        );
      const accident = res.rows[0] ?? null;
      if (!accident) return null;
      // SAF-B30 / F35: previously spawned AC work orders survived only in React state. Reload them
      // from maintenance.work_orders by the durable description token (no back-link column on prod yet).
      const wos = await listAccidentSpawnedWorkOrders(client, query.data.operating_company_id, params.data.id);
      // LIABILITY column-wave: same shape as the work-order reload above — spawnSafetyLiability's
      // result (safety.routes.ts spawn-liability route) was only ever toasted, never persisted or
      // re-read, so the drawer had nothing to render on reload even though the liability itself was
      // created with origin='safety_accident', origin_id=<this accident>. Reverse-JOIN instead of a
      // new back-link column, same discipline as the WO reload just above.
      const liabRes = await client.query(
        `SELECT id::text FROM driver_finance.driver_liabilities
         WHERE operating_company_id = $1::uuid AND origin = 'safety_accident' AND origin_id = $2::uuid
         ORDER BY created_at DESC LIMIT 1`,
        [query.data.operating_company_id, params.data.id]
      );
      const spawnedLiabilityId = liabRes.rows[0]?.id ? String(liabRes.rows[0].id) : null;
      return { ...accident, spawned_work_orders: wos, spawned_liability_id: spawnedLiabilityId };
    });
    if (!row) return reply.code(404).send({ error: "accident_not_found" });
    return row;
  });

  // SC1 office creator: create an accident report from the computer (safety officer / office).
  // Additive to the driver-PWA / WO-conversion origination paths — those remain intact. Persists the
  // four catalog links (driver_id / unit_id / vendor_id / load_id) captured by the office wizard.
  app.post("/api/v1/safety/accidents", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createAccidentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = body.data.operating_company_id;

    const created = await withCompanyScope(user.uuid, companyId, async (client) => {
      const missingLinks = await missingAccidentCompanyLinks(client, companyId, body.data);
      if (missingLinks.length > 0) return { kind: "link_not_found" as const, missingLinks };
      const res = await client.query(
        `
          INSERT INTO safety.accident_reports (
            operating_company_id,
            accident_type_id,
            driver_id,
            unit_id,
            trailer_id,
            vendor_id,
            load_id,
            accident_at,
            description,
            at_fault,
            preventable,
            police_report_number,
            insurance_claim_number,
            location,
            third_party_name,
            third_party_plate,
            vendor_invoice_number,
            bill_or_expense_ref
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,
            COALESCE($8::timestamptz, now()),$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
          )
          RETURNING *
        `,
        [
          companyId,
          body.data.accident_type_id,
          body.data.driver_id ?? null,
          body.data.unit_id ?? null,
          body.data.trailer_id ?? null,
          body.data.vendor_id ?? null,
          body.data.load_id ?? null,
          body.data.accident_at ?? null,
          body.data.description ?? null,
          body.data.at_fault ?? null,
          body.data.preventable ?? null,
          body.data.police_report_number ?? null,
          body.data.insurance_claim_number ?? null,
          body.data.location ?? null,
          body.data.third_party_name ?? null,
          body.data.third_party_plate ?? null,
          body.data.vendor_invoice_number ?? null,
          body.data.bill_or_expense_ref ?? null,
        ]
      );
      const inserted = res.rows[0];
      // C9 columns / cost lines activate only after HOLD migration 202609180000 — never 500 if absent.
      if (inserted?.id) {
        try {
          await client.query(
            `
              UPDATE safety.accident_reports
              SET record_type = $3,
                  service_type = $4,
                  report_date = $5::date,
                  tax_rate_pct = $6
              WHERE id = $1 AND operating_company_id = $2::uuid
            `,
            [
              inserted.id,
              companyId,
              body.data.record_type ?? null,
              body.data.service_type ?? null,
              body.data.report_date ?? null,
              body.data.tax_rate_pct ?? null,
            ]
          );
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code !== "42703") throw err;
        }
        if ((body.data.cost_lines?.length ?? 0) > 0) {
          try {
            let ord = 0;
            for (const line of body.data.cost_lines ?? []) {
              await client.query(
                `
                  INSERT INTO safety.accident_cost_lines (
                    operating_company_id, accident_id, section, description, amount_cents, sort_order
                  ) VALUES ($1, $2, $3, $4, $5, $6)
                `,
                [
                  companyId,
                  inserted.id,
                  line.section,
                  line.description ?? "",
                  Number(line.amount_cents ?? 0),
                  line.sort_order ?? ord++,
                ]
              );
            }
          } catch (err) {
            const code = (err as { code?: string })?.code;
            if (code !== "42P01" && code !== "42703") throw err;
          }
        }
      }
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.accident.created",
        {
          resource_type: "safety.accident_reports",
          resource_id: inserted?.id,
          driver_id: body.data.driver_id ?? null,
          unit_id: body.data.unit_id ?? null,
          trailer_id: body.data.trailer_id ?? null,
          vendor_id: body.data.vendor_id ?? null,
          load_id: body.data.load_id ?? null,
          at_fault: body.data.at_fault ?? null,
          preventable: body.data.preventable ?? null,
          origin: "office_creator",
          operating_company_id: companyId,
        },
        "info",
        "SC1-ACCIDENT-OFFICE-CREATOR"
      );
      return { kind: "ok" as const, row: inserted ?? null };
    });
    if (created.kind === "link_not_found") {
      return reply.code(404).send({ error: "accident_link_not_found", fields: created.missingLinks });
    }
    if (!created.row) return reply.code(500).send({ error: "accident_create_failed" });
    return reply.code(201).send(created.row);
  });

  // SC1: patch an existing accident report's linked entities / core fields (company-scoped).
  app.patch("/api/v1/safety/accidents/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = patchAccidentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    // Lockstep dynamic SET over a fixed column whitelist — only the provided (non-undefined) fields
    // are updated, each bound as a parameter (no interpolation of values).
    const patchable: Array<{ key: keyof typeof body.data; column: string; cast?: string }> = [
      { key: "driver_id", column: "driver_id" },
      { key: "unit_id", column: "unit_id" },
      { key: "trailer_id", column: "trailer_id" },
      { key: "vendor_id", column: "vendor_id" },
      { key: "load_id", column: "load_id" },
      { key: "accident_at", column: "accident_at", cast: "::timestamptz" },
      { key: "description", column: "description" },
      { key: "at_fault", column: "at_fault" },
      { key: "preventable", column: "preventable" },
      { key: "police_report_number", column: "police_report_number" },
      { key: "insurance_claim_number", column: "insurance_claim_number" },
      { key: "location", column: "location" },
      { key: "third_party_name", column: "third_party_name" },
      { key: "third_party_plate", column: "third_party_plate" },
      { key: "vendor_invoice_number", column: "vendor_invoice_number" },
      { key: "bill_or_expense_ref", column: "bill_or_expense_ref" },
      { key: "record_type", column: "record_type" },
      { key: "accident_type_id", column: "accident_type_id" },
      { key: "service_type", column: "service_type" },
      { key: "report_date", column: "report_date", cast: "::date" },
      { key: "tax_rate_pct", column: "tax_rate_pct" },
    ];
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const field of patchable) {
      const value = body.data[field.key];
      if (value === undefined) continue;
      values.push(value === null ? null : value);
      setClauses.push(`${field.column} = $${values.length}${field.cast ?? ""}`);
    }
    if (setClauses.length === 0) return reply.code(400).send({ error: "no_fields_to_update" });

    const updated = await withCompanyScope(user.uuid, companyId, async (client) => {
      const missingLinks = await missingAccidentCompanyLinks(client, companyId, body.data);
      if (missingLinks.length > 0) return { kind: "link_not_found" as const, missingLinks };
      const beforeRes = await client.query(`SELECT * FROM safety.accident_reports WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
          params.data.id,
          companyId,
        ]);
      const before = beforeRes.rows[0];
      if (!before) return null;

      const idParamIndex = values.length + 1;
      const companyParamIndex = values.length + 2;
      const res = await client.query(
        `
          UPDATE safety.accident_reports
          SET ${setClauses.join(", ")}, updated_at = now()
          WHERE id = $${idParamIndex}
            AND operating_company_id = $${companyParamIndex}::uuid
          RETURNING *
        `,
        [...values, params.data.id, companyId]
      );
      const after = res.rows[0];
      if (!after) return null;
      // SCEN01-HOP1-COST-LINES-PATCH-SILENT-DROP — the PATCH body schema has always accepted
      // cost_lines (frontend sends the full Section A/B array on every "Save Changes"), but this
      // handler only ever wrote the accident_reports columns above; cost_lines was validated and
      // then silently discarded — a 200 with no error, so the office UI shows a "saved" toast while
      // the line vanishes on next load. The CREATE path (POST) already does this insert; mirror it
      // here as a replace-all (the client always submits the complete current line set, never a
      // delta), same forward-compat tolerance for the pre-migration table/columns.
      if (body.data.cost_lines !== undefined) {
        try {
          await client.query(
            `DELETE FROM safety.accident_cost_lines WHERE accident_id = $1 AND operating_company_id = $2::uuid`,
            [params.data.id, companyId]
          );
          let ord = 0;
          for (const line of body.data.cost_lines) {
            await client.query(
              `
                INSERT INTO safety.accident_cost_lines (
                  operating_company_id, accident_id, section, description, amount_cents, sort_order
                ) VALUES ($1, $2, $3, $4, $5, $6)
              `,
              [companyId, params.data.id, line.section, line.description ?? "", Number(line.amount_cents ?? 0), line.sort_order ?? ord++]
            );
          }
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code !== "42P01" && code !== "42703") throw err;
        }
      }
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.accident.updated",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          changes: buildPatchChanges(body.data as Record<string, unknown>, before, after),
          operating_company_id: companyId,
        },
        "info",
        "SC1-ACCIDENT-OFFICE-CREATOR"
      );
      return after;
    });
    if (updated && "kind" in updated && updated.kind === "link_not_found") {
      return reply.code(404).send({ error: "accident_link_not_found", fields: updated.missingLinks });
    }
    if (!updated) return reply.code(404).send({ error: "accident_not_found" });
    return updated;
  });

  app.patch("/api/v1/safety/accidents/:id/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = statusBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.accident_reports
          SET status = $2, updated_at = now()
          WHERE id = $1
            AND operating_company_id = $3::uuid
          RETURNING *
        `,
        [params.data.id, body.data.status, query.data.operating_company_id]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.event_status_changed",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          status: body.data.status,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return res.rows[0];
    });
    if (!updated) return reply.code(404).send({ error: "accident_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/accidents/:id/photos", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    const safeFilename = (file.filename ?? "photo").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const photoKey = `safety/accidents/${query.data.operating_company_id}/${params.data.id}/${randomUUID()}-${safeFilename}`;

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const exists = await client.query(
        `SELECT id FROM safety.accident_reports WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      if (!exists.rows[0]) return null;
      const persisted = await client.query(
        `UPDATE safety.accident_reports
            SET photo_keys = array_append(photo_keys, $3), updated_at = now()
          WHERE id = $1 AND operating_company_id = $2::uuid
          RETURNING id, photo_keys`,
        [params.data.id, query.data.operating_company_id, photoKey]
      );
      if (!persisted.rows[0]) return null;
      // Keep the canonical row mutation and its audit in the company transaction. If R2 rejects the
      // bytes, this UPDATE rolls back and the endpoint cannot paint a durable photo key as uploaded.
      await putObjectBytes(photoKey, buffer, file.mimetype || "application/octet-stream");
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.accident.photo_added",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          photo_key: photoKey,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return {
        accident_id: params.data.id,
        photo_key: photoKey,
        photo_keys: persisted.rows[0].photo_keys,
        added_at: new Date().toISOString(),
      };
    });
    if (!result) return reply.code(404).send({ error: "accident_not_found" });
    return reply.code(201).send(result);
  });

  // Rate-limited per the repo pattern (config.rateLimit, cf. accounting/expenses.routes.ts). 30/min:
  // this writes a driver debt, so it sits with the other money-mutating routes, not the read tier.
  app.post("/api/v1/safety/accidents/:id/spawn-liability", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    // SAF-F35 / SAF-B30: create a real driver_finance.driver_liabilities row (same pattern as
    // civil-fine convert). Amount = SUM(accident_cost_lines.amount_cents). Idempotent on
    // origin='safety_accident' + origin_id. Seeds settlement deduction via existing service
    // (apply stays behind SETTLEMENT_DEDUCTION_APPLY_ENABLED — no new GL math).
    const outcome = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await client.query("BEGIN");
      try {
        const accidentRes = await client.query(
          `
            SELECT id, driver_id, description, load_id, unit_id
            FROM safety.accident_reports
            WHERE id = $1
              AND operating_company_id = $2::uuid
            LIMIT 1
            FOR UPDATE
          `,
          [params.data.id, query.data.operating_company_id]
        );
        const accident = accidentRes.rows[0] as
          | {
              id: string;
              driver_id: string | null;
              description: string | null;
              load_id: string | null;
              unit_id: string | null;
            }
          | undefined;
        if (!accident) {
          await client.query("ROLLBACK");
          return { kind: "not_found" as const };
        }
        if (!accident.driver_id) {
          await client.query("ROLLBACK");
          return { kind: "no_driver" as const };
        }

        const existingRes = await client.query(
          `
            SELECT id::text
            FROM driver_finance.driver_liabilities
            WHERE operating_company_id = $1::uuid
              AND origin = 'safety_accident'
              AND origin_id = $2
            ORDER BY created_at ASC
            LIMIT 1
          `,
          [query.data.operating_company_id, accident.id]
        );
        const existingId = (existingRes.rows[0] as { id?: string } | undefined)?.id;
        if (existingId) {
          await client.query("COMMIT");
          return { kind: "reused" as const, liabilityId: existingId };
        }

        const sumRes = await client.query(
          `
            SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
            FROM safety.accident_cost_lines
            WHERE accident_id = $1
              AND operating_company_id = $2::uuid
          `,
          [accident.id, query.data.operating_company_id]
        );
        const amountCents = Number((sumRes.rows[0] as { total_cents?: string | number })?.total_cents ?? 0);
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          await client.query("ROLLBACK");
          return { kind: "no_amount" as const };
        }

        const driverRes = await client.query(
          `SELECT id, status FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
          [accident.driver_id, query.data.operating_company_id]
        );
        const driver = driverRes.rows[0] as { id?: string; status?: string } | undefined;
        if (!driver || String(driver.status ?? "").toLowerCase() !== "active") {
          await client.query("ROLLBACK");
          return { kind: "driver_inactive" as const };
        }

        const desc =
          `Accident damage recovery: ${String(accident.description ?? "").trim() || accident.id}`.slice(0, 500);
        // C6-MONEY-JE-EXEMPT: accident spawn-liability seeds driver_finance.driver_liabilities +
        // createSettlementDeduction only (recovery subledger). Balanced JE posts later on settlement
        // apply behind SETTLEMENT_DEDUCTION_APPLY_ENABLED — same posture as internal-fine convert
        // (safety-v5) and civil-fine convert-to-liability. Do NOT invent a solo GL poster here.
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
              status
            ) VALUES (
              -- requires_acknowledgment = FALSE. Deduction authorization is the signed HIRE CONTRACT,
              -- not a per-charge driver e-sign: legal/signed-finance-handoff.service.ts (owner-LOCKED
              -- 2026-07-04/05) states "there is NO separate driver-facing deduction-authorization
              -- e-sign … do NOT build a separate driver e-sign flow". Gating here on a driver tap
              -- contradicted that lock and stalled every at-fault recovery behind a signature the
              -- company never asks for. The company-side control is unchanged and is where it belongs:
              -- blueprint MUST 3.4.2(d)(e) — a user signs off at settlement prep with a digital
              -- signature on file, and maker != checker (F13) still applies before anything posts.
              $1,$2,'accident_damage',$3,$4,$4,0,false,'safety_accident',$5,'pending_recovery'
            )
            RETURNING id::text
          `,
          // original_amount / current_balance are numeric(10,2) DOLLARS (see cash-advance-create.ts,
          // which writes body.amount in dollars, and fuel-posting/poster.service.ts, which reads them
          // back with *100 to get cents). Passing amountCents here stored 250000 for a $2,500 charge —
          // a 100x overstatement of what the driver is told they owe.
          [query.data.operating_company_id, accident.driver_id, desc, amountCents / 100, accident.id]
        );
        const liabilityId = (liabilityRes.rows[0] as { id?: string } | undefined)?.id;
        if (!liabilityId) throw new Error("liability_create_failed");

        const deduction = await createSettlementDeduction(client, {
          driverId: String(accident.driver_id),
          operatingCompanyId: query.data.operating_company_id,
          amountCents,
          reason: desc,
          sourceType: "damage",
          loadId: accident.load_id ? String(accident.load_id) : null,
          createdByUserId: user.uuid,
        });

        await appendCrudAudit(
          client,
          user.uuid,
          "safety.accident.spawn_liability",
          {
            resource_type: "safety.accident_reports",
            resource_id: params.data.id,
            operating_company_id: query.data.operating_company_id,
            spawned_liability_id: liabilityId,
            amount_cents: amountCents,
            settlement_deduction_id: deduction.id,
            outcome: "created",
          },
          "info",
          "BT-3-SAFETY-LIABILITIES-REBUILD"
        );

        await client.query("COMMIT");
        return { kind: "created" as const, liabilityId, amountCents, deductionId: deduction.id };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    if (outcome.kind === "not_found") return reply.code(404).send({ error: "accident_not_found" });
    if (outcome.kind === "no_driver") {
      return reply.code(422).send({
        error: "accident_missing_driver",
        message: "Assign a driver on the accident before spawning a liability.",
      });
    }
    if (outcome.kind === "no_amount") {
      return reply.code(422).send({
        error: "accident_cost_lines_required",
        message: "Add estimator cost lines (section A/B) with a positive total before spawning a liability.",
      });
    }
    if (outcome.kind === "driver_inactive") {
      return reply.code(422).send({ error: "driver_not_active" });
    }

    return {
      accident_id: params.data.id,
      spawned_liability_id: outcome.liabilityId,
      reused: outcome.kind === "reused",
      amount_cents: outcome.kind === "created" ? outcome.amountCents : undefined,
      settlement_deduction_id: outcome.kind === "created" ? outcome.deductionId : undefined,
    };
  });

  app.post("/api/v1/safety/accidents/:id/spawn-wo", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const accidentRes = await client.query(
        `
          SELECT *
          FROM safety.accident_reports
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const accident = accidentRes.rows[0];
      if (!accident) return null;

      // SAF-B30 / F35: double-click / re-open used to mint a second AC work order with no durable
      // back-link. Reuse the first non-voided WO whose description carries this accident id.
      const existing = await listAccidentSpawnedWorkOrders(client, query.data.operating_company_id, params.data.id);
      if (existing.length > 0) {
        const first = existing[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.accident.spawn_wo",
          {
            resource_type: "safety.accident_reports",
            resource_id: params.data.id,
            spawned_wo_id: first.id,
            spawned_wo_display_id: first.display_id,
            reused_was_true: true,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-LIABILITIES-REBUILD"
        );
        return {
          accident_id: params.data.id,
          spawned_wo_id: first.id,
          spawned_wo_display_id: first.display_id,
          reused: true,
          spawned_work_orders: existing,
        };
      }

      const accidentToken = accidentSpawnDescription(params.data.id);
      const displayRes = await client.query<{ display_id: string; sequence: number }>(
        `
          SELECT display_id, sequence
          FROM maintenance.next_wo_display_id($1, 'AC', CURRENT_DATE, $2)
        `,
        [accident.unit_id, query.data.operating_company_id]
      );
      const display = displayRes.rows[0];

      const woRes = await client.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id,
            wo_type,
            source_type,
            status,
            unit_id,
            equipment_id,
            driver_id,
            load_id,
            vendor_id,
            insurance_claim_id,
            opened_at,
            repair_location,
            description,
            display_id,
            unit_sequence
          )
          VALUES (
            $1,
            'accident',
            'AC',
            'open',
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            now(),
            'external_shop',
            $8,
            $9,
            $10
          )
          RETURNING id, display_id
        `,
        [
          query.data.operating_company_id,
          accident.unit_id,
          accident.trailer_id ?? null,
          accident.driver_id ?? null,
          accident.load_id ?? null,
          accident.vendor_id ?? null,
          accident.insurance_claim_id ?? null,
          accidentToken,
          display?.display_id ?? null,
          Number(display?.sequence ?? 0) || null,
        ]
      );
      const wo = woRes.rows[0];

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo_display_id_generated",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          display_id: wo.display_id,
          unit_sequence: Number(display?.sequence ?? 0),
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "P3-T11.6.2-ARRIVING-SOON"
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.accident.spawn_wo",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          spawned_wo_id: wo.id,
          spawned_wo_display_id: wo.display_id,
          reused: false,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return {
        accident_id: params.data.id,
        spawned_wo_id: wo.id,
        spawned_wo_display_id: wo.display_id,
        reused: false,
        spawned_work_orders: [{ id: wo.id, display_id: wo.display_id }],
      };
    });
    if (!payload) return reply.code(404).send({ error: "accident_not_found" });
    return payload;
  });

  app.get("/api/v1/safety/csa/latest", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM safety.csa_scores
            WHERE operating_company_id = $1::uuid
            ORDER BY computed_at DESC
            LIMIT 1
          `,
          [query.data.operating_company_id]
        );
      const latest = res.rows[0] ?? null;
      return latest ? { ...latest, basic_hazmat: null } : null;
    });
    return { latest: row, source: INTERNAL_CSA_SOURCE_METADATA };
  });
}
