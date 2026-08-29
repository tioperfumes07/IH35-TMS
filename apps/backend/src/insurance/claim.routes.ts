import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  claimIdParamsSchema,
  createClaimBodySchema,
  INSURANCE_CLAIM_STATUSES,
  type InsuranceClaimStatus,
  listClaimsQuerySchema,
  operatingCompanySchema,
  updateClaimBodySchema,
} from "./claim.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { resolveMdataAssetId } from "./resolve-asset-id.shared.js";
import { type ClaimColumnCapabilities, getClaimColumnCapabilities } from "./claim-columns.js";
import { postInsuranceClaimRecovery } from "../accounting/insurance-claim-recovery-posting/poster.service.js";
import { excludeInsuranceFixtureSql } from "./insurance-visibility.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
// INS-MONEY-F6965 — companyBusinessDate(), not new Date().toISOString() (UTC): after ~19:00
// Central this GL posting date can land one calendar day ahead of the real business day.
import { companyBusinessDate } from "../lib/company-business-date.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

const CLAIM_STATUS_TRANSITIONS: Record<InsuranceClaimStatus, readonly InsuranceClaimStatus[]> = {
  open: ["investigating", "approved", "denied", "closed"],
  investigating: ["approved", "denied", "closed"],
  approved: ["paid", "closed"],
  denied: ["closed"],
  paid: ["closed"],
  closed: [],
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable, caps: ClaimColumnCapabilities) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    // Probed once per process and cached; every claim SQL builder below is shaped by the answer so
    // that a database missing either held migration degrades instead of 500-ing.
    const caps = await getClaimColumnCapabilities(client as Queryable);
    return fn(client as Queryable, caps);
  });
}

// The six economics columns and the entity-scope column both come from HELD migrations, so a
// database that is a migration behind does not have them. Every SQL builder below takes the
// probed capabilities and degrades to the pre-migration shape rather than referencing a column
// that isn't there — see claim-columns.ts for the prod evidence behind each flag.
function claimSelectColumns(caps: ClaimColumnCapabilities, alias = "c") {
  const a = alias ? `${alias}.` : "";
  // Neutral literals matching 202607730000's declared defaults, so the API response shape is
  // identical before and after the migration lands and the UI never has to branch.
  const economics = caps.economics
    ? `
    ${a}fault,
    ${a}driver_responsible,
    ${a}trailer_id::text,
    trailers.equipment_number AS trailer_display_id,
    ${a}deductible_cents::bigint,
    ${a}recovery_rail,
    ${a}repair_books_treatment`
    : `
    'undetermined'::text AS fault,
    NULL::boolean AS driver_responsible,
    NULL::text AS trailer_id,
    NULL::text AS trailer_display_id,
    0::bigint AS deductible_cents,
    'ask'::text AS recovery_rail,
    'ask'::text AS repair_books_treatment`;

  return `
    ${a}id::text,
    ${a}tenant_id::text,
    ${a}claim_number,
    ${a}policy_id::text,
    ${a}asset_id::text,
    assets.unit_id::text AS unit_id,
    ${a}accident_date::text,
    ${a}reported_date::text,
    ${a}status,
    ${a}amount_claimed_cents::bigint,
    ${a}amount_paid_cents::bigint,
    ${a}adjuster_name,
    ${a}adjuster_email,
    ${a}notes,
    ${a}created_at::text,
    ${a}accident_report_id::text,
    ${a}load_id::text,
    ${a}driver_id::text,
    -- CLS-UUID-LABEL: ClaimsTab rendered .slice(0, 8) of each of these ids because the payload carried
    -- ONLY ids. An adjuster saw "a3f9c21b" where a driver, unit, load or policy number belongs, and a
    -- link nobody can read is decoration. Slicing at the call site would only relocate the uuid, so the
    -- names are resolved here, at the query, which is the actual root cause.
    NULLIF(TRIM(CONCAT(COALESCE(cdrv.first_name, ''), ' ', COALESCE(cdrv.last_name, ''))), '') AS driver_display_name,
    cunit.unit_number AS unit_display_id,
    cload.load_number AS load_display_id,
    cpol.policy_number AS policy_display_id,${economics}
  `;
}

// Entity-scoped joins. Joining these hubs by id alone lets a claim in one operating company
// surface an asset or trailer belonging to another — the cross-entity leak class that is masked
// today (RLS is role-scoped, TRANSP dominates the data) and breaks the moment USMCA goes live.
//
// Scoping columns VERIFIED against the Neon prod branch br-fancy-credit-akjnd07a on 2026-07-22
// (RLS-immune information_schema/pg_catalog reads), not assumed:
//   insurance.claim -> operating_company_id EXISTS and is the live forced-RLS key; the policy is
//                      (identity.is_lucia_bypass() OR operating_company_id::text = current_setting(...))
//                      on polcmd '*'. tenant_id also exists and is what every writer fills in today.
//   mdata.assets    -> tenant_id                (no operating_company_id)
//   mdata.equipment -> owner_company_id + currently_leased_to_company_id  (the owner/leased pair;
//                      a trailer TRK owns and leases to TRANSP must still resolve for TRANSP)
//
// The claim side of each predicate uses COALESCE(c.operating_company_id, c.tenant_id): prod's RLS
// key is operating_company_id, but rows written before the writers started populating it carry the
// value in tenant_id only, and a database without held 202607490000 has no such column at all.
// Keying on operating_company_id alone would silently resolve to NULL and drop the unit/trailer
// off the claim on every one of those rows.
function claimFrom(caps: ClaimColumnCapabilities) {
  const scope = caps.operatingCompanyId ? `COALESCE(c.operating_company_id, c.tenant_id)` : `c.tenant_id`;
  const trailerJoin = caps.economics
    ? `
  LEFT JOIN mdata.equipment trailers
    ON trailers.id = c.trailer_id
   AND (
        trailers.owner_company_id = ${scope}
     OR trailers.currently_leased_to_company_id = ${scope}
   )`
    : "";
  return `
  FROM insurance.claim c
  LEFT JOIN mdata.assets assets
    ON assets.id = c.asset_id
   AND assets.tenant_id = ${scope}${trailerJoin}
  -- CLS-UUID-LABEL display-name joins. Each is scoped the way ITS OWN table requires, not uniformly:
  --   drivers/loads carry operating_company_id;
  --   mdata.units has NO operating_company_id (§4) and is scoped by the owner/leased PAIR, so a
  --     TRK-owned unit leased to USMCA still resolves;
  --   insurance.policy is joined on tenant_id ON PURPOSE — its operating_company_id column exists but
  --     is nullable and is never written by the create path (see LV-TXN-014), so joining on it would
  --     silently resolve NOTHING and leave the policy label blank again.
  LEFT JOIN mdata.drivers cdrv
    ON cdrv.id = c.driver_id
   AND (
        cdrv.operating_company_id = ${scope}
     OR EXISTS (
          SELECT 1
          FROM mdata.driver_company_authorizations claim_driver_dca
          WHERE claim_driver_dca.driver_id = cdrv.id
            AND claim_driver_dca.company_id = ${scope}
            AND claim_driver_dca.is_authorized = true
            AND claim_driver_dca.deactivated_at IS NULL
        )
   )
  LEFT JOIN mdata.units cunit
    ON cunit.id = assets.unit_id
   AND COALESCE(cunit.currently_leased_to_company_id, cunit.owner_company_id) = ${scope}
  LEFT JOIN mdata.loads cload
    ON cload.id = c.load_id
   AND cload.operating_company_id = ${scope}
  LEFT JOIN insurance.policy cpol
    ON cpol.id = c.policy_id
   AND cpol.tenant_id = ${scope}
`;
}

async function assertOptionalHubExists(
  client: Queryable,
  operatingCompanyId: string,
  kind: "accident_report" | "load" | "driver" | "trailer",
  id: string | null | undefined,
  allowedClaimId?: string,
): Promise<"ok" | "not_found" | "already_linked"> {
  if (id === undefined || id === null) return "ok";
  if (kind === "accident_report") {
    const res = await client.query<{ id: string; insurance_claim_id: string | null }>(
      `
        SELECT id::text, insurance_claim_id::text
        FROM safety.accident_reports
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        FOR UPDATE
        LIMIT 1
      `,
      [id, operatingCompanyId]
    );
    const accident = res.rows[0];
    if (!accident) return "not_found";
    if (accident.insurance_claim_id && accident.insurance_claim_id !== allowedClaimId) return "already_linked";
    return "ok";
  }
  if (kind === "load") {
    const res = await client.query(
      `
        SELECT id::text
        FROM mdata.loads
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [id, operatingCompanyId]
    );
    return res.rows[0] ? "ok" : "not_found";
  }
  if (kind === "trailer") {
    // mdata.equipment (trailers) scoping mirrors mdata.units: owned OR currently leased to this entity
    // (see apps/backend/src/fleet/trailer.routes.ts).
    const res = await client.query(
      `
        SELECT id::text
        FROM mdata.equipment
        WHERE id = $1::uuid
          AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
        LIMIT 1
      `,
      [id, operatingCompanyId]
    );
    return res.rows[0] ? "ok" : "not_found";
  }
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1
            FROM mdata.driver_company_authorizations claim_write_driver_dca
            WHERE claim_write_driver_dca.driver_id = d.id
              AND claim_write_driver_dca.company_id = $2::uuid
              AND claim_write_driver_dca.is_authorized = true
              AND claim_write_driver_dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  return res.rows[0] ? "ok" : "not_found";
}

function canTransitionClaimStatus(currentStatus: InsuranceClaimStatus, nextStatus: InsuranceClaimStatus) {
  if (currentStatus === nextStatus) return true;
  return CLAIM_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

export async function registerInsuranceClaimRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/claims", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listClaimsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client, caps) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      // INSURANCE-DASHBOARD-FIXTURE-LEAK: keep the Claims list in parity with the Open Claims KPI
      // (summary.routes.ts), which already excludes agent-created fixture rows.
      const filters = ["tenant_id = $1::uuid", excludeInsuranceFixtureSql("c.claim_number")];
      if (parsed.data.policy_id) {
        values.push(parsed.data.policy_id);
        filters.push(`policy_id = $${values.length}::uuid`);
      }
      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`status = $${values.length}`);
      }
      if (parsed.data.asset_id) {
        // Accept unit-or-asset id (same bridge as create): resolve to mdata.assets.id when possible.
        const resolvedAssetId =
          (await resolveMdataAssetId(client, parsed.data.operating_company_id, parsed.data.asset_id)) ??
          parsed.data.asset_id;
        values.push(resolvedAssetId);
        filters.push(`asset_id = $${values.length}::uuid`);
      }
      if (parsed.data.driver_id) {
        values.push(parsed.data.driver_id);
        filters.push(`driver_id = $${values.length}::uuid`);
      }
      if (parsed.data.unit_id) {
        values.push(parsed.data.unit_id);
        filters.push(`unit_id = $${values.length}::uuid`);
      }
      if (parsed.data.load_id) {
        values.push(parsed.data.load_id);
        filters.push(`load_id = $${values.length}::uuid`);
      }
      if (parsed.data.trailer_id) {
        // trailer_id only exists once held 202607730000 is applied. Filtering by a column that is
        // not there would 500; silently dropping the filter would be worse — it would answer a
        // "claims for THIS trailer" question with every claim in the company. Return the honest
        // "not available yet" instead.
        if (!caps.economics) return { kind: "trailer_filter_unavailable" as const };
        values.push(parsed.data.trailer_id);
        filters.push(`trailer_id = $${values.length}::uuid`);
      }
      const scopedFilters = filters.map((f) =>
        f
          .replace(/^tenant_id/, "c.tenant_id")
          .replace(/^policy_id/, "c.policy_id")
          .replace(/^status/, "c.status")
          .replace(/^asset_id/, "c.asset_id")
          .replace(/^driver_id/, "c.driver_id")
          .replace(/^unit_id/, "assets.unit_id")
          .replace(/^load_id/, "c.load_id")
          .replace(/^trailer_id/, "c.trailer_id"),
      );
      const result = await client.query(
        `
          SELECT ${claimSelectColumns(caps, "c")}
          ${claimFrom(caps)}
          WHERE ${scopedFilters.join(" AND ")}
          ORDER BY c.accident_date DESC, c.created_at DESC
        `,
        values
      );
      return result.rows;
    });

    if (!Array.isArray(rows) && rows?.kind === "trailer_filter_unavailable") {
      return reply.code(503).send({
        error: "trailer_filter_unavailable",
        message:
          "Filtering claims by trailer requires migration 202607730000 (insurance.claim.trailer_id), which has not been applied to this database yet.",
      });
    }

    return { claims: rows };
  });

  /** Read-only reverse fan-out: claim → accidents / lawsuits / matters / incidents already linked in. */
  app.get(
    "/api/v1/insurance/claims/:id/graph",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const params = claimIdParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
      const query = operatingCompanySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

      const graph = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client, caps) => {
      const claimRes = await client.query(
        `
          SELECT ${claimSelectColumns(caps, "c")}
          ${claimFrom(caps)}
          WHERE c.tenant_id = $1::uuid AND c.id = $2::uuid
          LIMIT 1
        `,
        [query.data.operating_company_id, params.data.id]
      );
      const claim = claimRes.rows[0];
      if (!claim) return null;

      const [accidents, lawsuits, matters, incidents, chains] = await Promise.all([
        client.query(
          `
            SELECT id::text, insurance_claim_id::text, driver_id::text, unit_id::text, accident_at::text
            FROM safety.accident_reports
            WHERE operating_company_id = $1::uuid
              AND insurance_claim_id = $2::uuid
            ORDER BY accident_at DESC NULLS LAST, id ASC
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT id::text, case_number, claim_id::text, status, filed_date::text
            FROM insurance.lawsuit
            WHERE tenant_id = $1::uuid
              AND claim_id = $2::uuid
            ORDER BY filed_date DESC NULLS LAST, id ASC
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT id::text, matter_number, insurance_claim_id::text, status, type
            FROM legal.matters
            WHERE operating_company_id = $1::uuid
              AND insurance_claim_id = $2::uuid
            ORDER BY matter_number ASC, id ASC
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT id::text, auto_created_claim_id::text, incident_type, incident_at::text
            FROM safety.incidents
            WHERE operating_company_id = $1::uuid
              AND auto_created_claim_id = $2::uuid
            ORDER BY incident_at DESC NULLS LAST, id ASC
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT uuid::text AS id, insurance_claim_id::text, final_resolution_status
            FROM safety.damage_continuity_chains
            WHERE operating_company_id = $1::uuid
              AND insurance_claim_id = $2::uuid
            ORDER BY uuid ASC
          `,
          [query.data.operating_company_id, params.data.id]
        ),
      ]);

      const colExists = async (schema: string, table: string, column: string) => {
        const r = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
          [schema, table, column]
        );
        return (r.rowCount ?? 0) > 0;
      };
      const hasExpenseClaim = await colExists("accounting", "expenses", "insurance_claim_id");
      const hasBillClaim = await colExists("accounting", "bills", "insurance_claim_id");
      const hasWoClaim = await colExists("maintenance", "work_orders", "insurance_claim_id");

      let expenses: unknown[] = [];
      let bills: unknown[] = [];
      let workOrders: unknown[] = [];
      if (hasExpenseClaim) {
        const er = await client.query(
          `SELECT id::text, total_amount_cents::text, status, transaction_date::text
             FROM accounting.expenses
            WHERE operating_company_id = $1::uuid AND insurance_claim_id = $2::uuid
            ORDER BY transaction_date DESC NULLS LAST, id ASC`,
          [query.data.operating_company_id, params.data.id]
        );
        expenses = er.rows;
      }
      if (hasBillClaim) {
        const br = await client.query(
          `SELECT id::text, bill_number, amount_cents::text, status, bill_date::text
             FROM accounting.bills
            WHERE operating_company_id = $1::uuid AND insurance_claim_id = $2::uuid
              AND revoked_at IS NULL
            ORDER BY bill_date DESC NULLS LAST, id ASC`,
          [query.data.operating_company_id, params.data.id]
        );
        bills = br.rows;
      }
      if (hasWoClaim) {
        const wr = await client.query(
          `SELECT id::text, display_id, status
             FROM maintenance.work_orders
            WHERE operating_company_id = $1::uuid AND insurance_claim_id = $2::uuid
            ORDER BY created_at DESC NULLS LAST, id ASC`,
          [query.data.operating_company_id, params.data.id]
        );
        workOrders = wr.rows;
      }

      // Honest gaps: keep the exact design-HOLD documented strings when columns are absent
      // (verify-claim-wo-bill-expense-fk-design locks these literals). Prod Neon already has
      // insurance_claim_id on bills/expenses/WOs (2026-07-25); gaps.* are null when present.
      const GAP_EXPENSE = "no accounting.expenses.claim_id (or equivalent) on prod";
      const GAP_WORK_ORDER = "no maintenance.work_orders.claim_id on prod";
      return {
        claim,
        reverse: {
          accidents: accidents.rows,
          lawsuits: lawsuits.rows,
          matters: matters.rows,
          incidents: incidents.rows,
          damage_continuity_chains: chains.rows,
          expenses,
          bills,
          work_orders: workOrders,
        },
        gaps: {
          expense: hasExpenseClaim ? null : GAP_EXPENSE,
          work_order: hasWoClaim ? null : GAP_WORK_ORDER,
          bill: hasBillClaim
            ? null
            : "no accounting.bills.insurance_claim_id on this DB (held migration 202607740000 — owner Neon-apply)",
          settlement_deduction: "no driver_finance.driver_settlement_deductions.source claim FK on prod",
        },
      };
      });

      if (!graph) return reply.code(404).send({ error: "claim_not_found" });
      return graph;
    }
  );

  app.post("/api/v1/insurance/claims",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createClaimBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client, caps) => {
      const policy = await client.query(
        `
          SELECT id::text
          FROM insurance.policy
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          LIMIT 1
        `,
        [body.operating_company_id, body.policy_id]
      );
      if (!policy.rows[0]) return { kind: "policy_not_found" as const };

      let resolvedAssetId: string | null = null;
      if (body.asset_id) {
        resolvedAssetId = await resolveMdataAssetId(client, body.operating_company_id, body.asset_id);
        if (!resolvedAssetId) return { kind: "asset_not_found" as const };
      }

      for (const [kind, id] of [
        ["accident_report", body.accident_report_id],
        ["load", body.load_id],
        ["driver", body.driver_id],
        ["trailer", body.trailer_id],
      ] as const) {
        const hub = await assertOptionalHubExists(client, body.operating_company_id, kind, id);
        if (hub === "already_linked") return { kind: "accident_report_already_linked" as const };
        if (hub === "not_found") {
          return { kind: `${kind}_not_found` as const };
        }
      }

      // operating_company_id is NOT optional on prod. insurance.claim carries FORCED RLS whose
      // policy — verified on br-fancy-credit-akjnd07a 2026-07-22, polcmd '*' so it is the WITH
      // CHECK for INSERT too — is
      //   identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)
      // The column is nullable with no default and this route sets app.operating_company_id, never
      // app.bypass_rls='lucia'. Writing only tenant_id therefore leaves operating_company_id NULL,
      // the WITH CHECK evaluates NULL (not true), and Postgres REJECTS the row. Prod
      // insurance.claim.n_tup_ins is 0 — claim creation has never once succeeded in production.
      // Both columns get the same value: tenant_id is what every existing read filters on, and
      // operating_company_id is what RLS enforces.
      //
      // Lockstep INSERT (skill §2): columns / expressions / values grow together, so a column that
      // this database does not have yet is simply never emitted and no placeholder can drift.
      const cols: string[] = [];
      const exprs: string[] = [];
      const insertValues: unknown[] = [];
      const put = (col: string, value: unknown, expr?: (p: string) => string) => {
        insertValues.push(value);
        const placeholder = `$${insertValues.length}`;
        cols.push(col);
        exprs.push(expr ? expr(placeholder) : placeholder);
      };

      put("tenant_id", body.operating_company_id, (p) => `${p}::uuid`);
      if (caps.operatingCompanyId) put("operating_company_id", body.operating_company_id, (p) => `${p}::uuid`);
      put("claim_number", body.claim_number);
      put("policy_id", body.policy_id, (p) => `${p}::uuid`);
      put("asset_id", body.asset_id ? resolvedAssetId : null, (p) => `${p}::uuid`);
      put("accident_date", body.accident_date, (p) => `${p}::date`);
      put("reported_date", body.reported_date, (p) => `${p}::date`);
      put("status", body.status ?? "open");
      put("amount_claimed_cents", body.amount_claimed_cents);
      put("amount_paid_cents", body.amount_paid_cents);
      put("adjuster_name", body.adjuster_name ?? null);
      put("adjuster_email", body.adjuster_email ?? null);
      put("notes", body.notes ?? null);
      put("accident_report_id", body.accident_report_id ?? null, (p) => `${p}::uuid`);
      put("load_id", body.load_id ?? null, (p) => `${p}::uuid`);
      put("driver_id", body.driver_id ?? null, (p) => `${p}::uuid`);
      if (caps.economics) {
        // COALESCE keeps 202607730000's declared defaults authoritative when the caller omits a
        // field — in particular recovery_rail / repair_books_treatment land on 'ask', never on a
        // silently-chosen rail (owner locks #1 and #2).
        put("fault", body.fault ?? null, (p) => `COALESCE(${p}, 'undetermined')`);
        put("driver_responsible", body.driver_responsible ?? null);
        put("trailer_id", body.trailer_id ?? null, (p) => `${p}::uuid`);
        put("deductible_cents", body.deductible_cents ?? null, (p) => `COALESCE(${p}, 0)`);
        put("recovery_rail", body.recovery_rail ?? null, (p) => `COALESCE(${p}, 'ask')`);
        put("repair_books_treatment", body.repair_books_treatment ?? null, (p) => `COALESCE(${p}, 'ask')`);
      } else if (
        body.fault !== undefined ||
        body.driver_responsible !== undefined ||
        body.trailer_id !== undefined ||
        body.deductible_cents !== undefined ||
        body.recovery_rail !== undefined ||
        body.repair_books_treatment !== undefined
      ) {
        // Accepting an economics field and dropping it on the floor would be the exact
        // "accepted by the API is not done" failure the standard names. Refuse instead.
        return { kind: "economics_unavailable" as const };
      }

      const insert = await client.query<{ id: string }>(
        `
          INSERT INTO insurance.claim (${cols.join(", ")})
          VALUES (${exprs.join(", ")})
          RETURNING id::text
        `,
        insertValues
      );
      const createdId = insert.rows[0]?.id;
      if (!createdId) throw new Error("insurance_claim_insert_failed");
      // P41 — insurance.claim.accident_report_id (set above) is the FORWARD FK; nothing wrote the
      // reverse pointer safety.accident_reports.insurance_claim_id (migration 202607250000), so a
      // claim created FROM an accident was reachable claim->accident but not accident->claim. Sync
      // both directions the moment the link is known, scoped to the same tenant so a cross-entity
      // accident_report_id (already rejected above by assertOptionalHubExists) can never be reached.
      if (body.accident_report_id) {
        const reverseLink = await client.query(
          `
            UPDATE safety.accident_reports
            SET insurance_claim_id = $3::uuid
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            RETURNING id::text
          `,
          [body.accident_report_id, body.operating_company_id, createdId]
        );
        if (!reverseLink.rows[0]?.id) throw new Error("insurance_claim_accident_reverse_link_failed");
      }
      const result = await client.query(
        `
          SELECT ${claimSelectColumns(caps, "c")}
          ${claimFrom(caps)}
          WHERE c.tenant_id = $1::uuid AND c.id = $2::uuid
          LIMIT 1
        `,
        [body.operating_company_id, createdId]
      );
      const claim = result.rows[0] as { id?: string } | undefined;
      if (!claim?.id) throw new Error("insurance_claim_detail_read_failed");
      await appendCrudAudit(client as never, user.uuid, "insurance.claim.created", {
        resource_type: "insurance.claim",
        resource_id: claim.id,
        operating_company_id: body.operating_company_id,
        policy_id: body.policy_id,
        accident_report_id: body.accident_report_id ?? null,
        load_id: body.load_id ?? null,
        driver_id: body.driver_id ?? null,
        trailer_id: body.trailer_id ?? null,
      });
      return { kind: "ok" as const, row: claim };
    });

    if (created.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (created.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
    if (created.kind === "accident_report_not_found") return reply.code(404).send({ error: "accident_report_not_found" });
    if (created.kind === "accident_report_already_linked") {
      return reply.code(409).send({ error: "accident_report_already_linked" });
    }
    if (created.kind === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
    if (created.kind === "driver_not_found") return reply.code(404).send({ error: "driver_not_found" });
    if (created.kind === "trailer_not_found") return reply.code(404).send({ error: "trailer_not_found" });
    if (created.kind === "economics_unavailable") {
      return reply.code(503).send({
        error: "economics_unavailable",
        message:
          "Claim economics fields (fault, driver_responsible, trailer_id, deductible_cents, recovery_rail, repair_books_treatment) require migration 202607730000, which has not been applied to this database yet.",
      });
    }
    return reply.code(201).send(created.row);
    }
  );

  app.patch("/api/v1/insurance/claims/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = claimIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = operatingCompanySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updateClaimBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });
    const body = bodyParsed.data;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client, caps) => {
      if (body.policy_id !== undefined) {
        const policy = await client.query(
          `
            SELECT id::text
            FROM insurance.policy
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [query.data.operating_company_id, body.policy_id]
        );
        if (!policy.rows[0]) return { kind: "policy_not_found" as const };
      }

      let resolvedPatchAssetId: string | null | undefined;
      if (body.asset_id !== undefined && body.asset_id !== null) {
        resolvedPatchAssetId = await resolveMdataAssetId(
          client,
          query.data.operating_company_id,
          body.asset_id,
        );
        if (!resolvedPatchAssetId) return { kind: "asset_not_found" as const };
      } else if (body.asset_id === null) {
        resolvedPatchAssetId = null;
      }

      for (const [kind, id] of [
        ["accident_report", body.accident_report_id],
        ["load", body.load_id],
        ["driver", body.driver_id],
        ["trailer", body.trailer_id],
      ] as const) {
        const hub = await assertOptionalHubExists(
          client,
          query.data.operating_company_id,
          kind,
          id,
          kind === "accident_report" ? params.data.id : undefined,
        );
        if (hub === "already_linked") return { kind: "accident_report_already_linked" as const };
        if (hub === "not_found") {
          return { kind: `${kind}_not_found` as const };
        }
      }

      if (body.status) {
        const currentClaim = await client.query<{ status: InsuranceClaimStatus }>(
          `
            SELECT status
            FROM insurance.claim
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [query.data.operating_company_id, params.data.id]
        );
        const currentStatus = currentClaim.rows[0]?.status;
        if (!currentStatus) return { kind: "claim_not_found" as const };
        if (!INSURANCE_CLAIM_STATUSES.includes(currentStatus)) return { kind: "claim_not_found" as const };
        if (!canTransitionClaimStatus(currentStatus, body.status)) {
          return { kind: "invalid_status_transition" as const, from: currentStatus, to: body.status };
        }
      }

      const assignments: string[] = [];
      const values: unknown[] = [query.data.operating_company_id, params.data.id];
      const setField = (column: string, value: unknown, cast = "") => {
        values.push(value);
        assignments.push(`${column} = $${values.length}${cast}`);
      };

      if (body.claim_number !== undefined) setField("claim_number", body.claim_number);
      if (body.policy_id !== undefined) setField("policy_id", body.policy_id, "::uuid");
      if (body.asset_id !== undefined) setField("asset_id", resolvedPatchAssetId ?? null, "::uuid");
      if (body.accident_date !== undefined) setField("accident_date", body.accident_date, "::date");
      if (body.reported_date !== undefined) setField("reported_date", body.reported_date, "::date");
      if (body.status !== undefined) setField("status", body.status);
      if (body.amount_claimed_cents !== undefined) setField("amount_claimed_cents", body.amount_claimed_cents);
      if (body.amount_paid_cents !== undefined) setField("amount_paid_cents", body.amount_paid_cents);
      if (body.adjuster_name !== undefined) setField("adjuster_name", body.adjuster_name);
      if (body.adjuster_email !== undefined) setField("adjuster_email", body.adjuster_email);
      if (body.notes !== undefined) setField("notes", body.notes);
      if (body.accident_report_id !== undefined) setField("accident_report_id", body.accident_report_id, "::uuid");
      if (body.load_id !== undefined) setField("load_id", body.load_id, "::uuid");
      if (body.driver_id !== undefined) setField("driver_id", body.driver_id, "::uuid");
      // WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000) — fault/responsibility/trailer/deductible/
      // recovery-rail/books-treatment are all editable post-create (investigation findings evolve).
      // Owner locks #1/#2: recovery_rail and repair_books_treatment are never auto-advanced by THIS
      // route — only ever set to a value the caller (a human, via the UI) explicitly sent.
      // On a database without 202607730000 these columns do not exist; refuse the edit rather than
      // accept it and drop it (or 500 on an UPDATE against a missing column).
      if (
        !caps.economics &&
        (body.fault !== undefined ||
          body.driver_responsible !== undefined ||
          body.trailer_id !== undefined ||
          body.deductible_cents !== undefined ||
          body.recovery_rail !== undefined ||
          body.repair_books_treatment !== undefined)
      ) {
        return { kind: "economics_unavailable" as const };
      }
      if (body.fault !== undefined) setField("fault", body.fault);
      if (body.driver_responsible !== undefined) setField("driver_responsible", body.driver_responsible);
      if (body.trailer_id !== undefined) setField("trailer_id", body.trailer_id, "::uuid");
      if (body.deductible_cents !== undefined) setField("deductible_cents", body.deductible_cents);
      if (body.recovery_rail !== undefined) setField("recovery_rail", body.recovery_rail);
      if (body.repair_books_treatment !== undefined) setField("repair_books_treatment", body.repair_books_treatment);

      if (assignments.length === 0) return { kind: "claim_not_found" as const };

      // P41 — same reverse-pointer gap as the create route: capture the PRIOR accident_report_id
      // before the UPDATE so a re-link (or unlink) can clear the old accident's back-pointer rather
      // than leaving it dangling at a claim that no longer references it.
      let priorAccidentReportId: string | null = null;
      if (body.accident_report_id !== undefined) {
        const prior = await client.query<{ accident_report_id: string | null }>(
          `SELECT accident_report_id::text FROM insurance.claim WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
          [query.data.operating_company_id, params.data.id]
        );
        priorAccidentReportId = prior.rows[0]?.accident_report_id ?? null;
      }

      const upd = await client.query<{ id: string }>(
        `
          UPDATE insurance.claim
          SET ${assignments.join(", ")}
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING id::text
        `,
        values
      );
      if (!upd.rows[0]) return { kind: "claim_not_found" as const };
      if (body.accident_report_id !== undefined) {
        if (priorAccidentReportId && priorAccidentReportId !== body.accident_report_id) {
          // Only clear if it still points at THIS claim — never clobber a link another claim made.
          const clearedReverse = await client.query(
            `
              UPDATE safety.accident_reports
              SET insurance_claim_id = NULL
              WHERE id = $1::uuid AND operating_company_id = $2::uuid AND insurance_claim_id = $3::uuid
              RETURNING id::text
            `,
            [priorAccidentReportId, query.data.operating_company_id, params.data.id]
          );
          if (!clearedReverse.rows[0]?.id) throw new Error("insurance_claim_prior_accident_reverse_unlink_failed");
        }
        if (body.accident_report_id) {
          const linkedReverse = await client.query(
            `
              UPDATE safety.accident_reports
              SET insurance_claim_id = $3::uuid
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
              RETURNING id::text
            `,
            [body.accident_report_id, query.data.operating_company_id, params.data.id]
          );
          if (!linkedReverse.rows[0]?.id) throw new Error("insurance_claim_accident_reverse_link_failed");
        }
      }
      const result = await client.query(
        `
          SELECT ${claimSelectColumns(caps, "c")}
          ${claimFrom(caps)}
          WHERE c.tenant_id = $1::uuid AND c.id = $2::uuid
          LIMIT 1
        `,
        [query.data.operating_company_id, params.data.id]
      );
      const claim = result.rows[0] as { id?: string; policy_id?: string | null; accident_report_id?: string | null; load_id?: string | null; driver_id?: string | null; trailer_id?: string | null } | undefined;
      if (!claim?.id) throw new Error("insurance_claim_update_detail_read_failed");
      await appendCrudAudit(client as never, user.uuid, "insurance.claim.updated", {
        resource_type: "insurance.claim",
        resource_id: claim.id,
        operating_company_id: query.data.operating_company_id,
        policy_id: claim.policy_id ?? null,
        accident_report_id: claim.accident_report_id ?? null,
        load_id: claim.load_id ?? null,
        driver_id: claim.driver_id ?? null,
        trailer_id: claim.trailer_id ?? null,
      });
      return { kind: "ok" as const, row: claim };
    });

    if (updated.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (updated.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
    if (updated.kind === "accident_report_not_found") return reply.code(404).send({ error: "accident_report_not_found" });
    if (updated.kind === "accident_report_already_linked") {
      return reply.code(409).send({ error: "accident_report_already_linked" });
    }
    if (updated.kind === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
    if (updated.kind === "driver_not_found") return reply.code(404).send({ error: "driver_not_found" });
    if (updated.kind === "trailer_not_found") return reply.code(404).send({ error: "trailer_not_found" });
    if (updated.kind === "economics_unavailable") {
      return reply.code(503).send({
        error: "economics_unavailable",
        message:
          "Claim economics fields (fault, driver_responsible, trailer_id, deductible_cents, recovery_rail, repair_books_treatment) require migration 202607730000, which has not been applied to this database yet.",
      });
    }
    if (updated.kind === "claim_not_found") return reply.code(404).send({ error: "claim_not_found" });
    if (updated.kind === "invalid_status_transition") {
      return reply.code(400).send({
        error: "invalid_status_transition",
        from: updated.from,
        to: updated.to,
      });
    }

    // INS-02 — insurer recovery GL hop behind INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED (default OFF).
    // Only when amount_paid_cents was part of this PATCH; flag OFF => gl_posting.reason=flag_off, no JE.
    let gl_posting: Awaited<ReturnType<typeof postInsuranceClaimRecovery>> | undefined;
    if (body.amount_paid_cents !== undefined && updated.kind === "ok" && updated.row) {
      const paid = Number((updated.row as { amount_paid_cents?: number }).amount_paid_cents ?? body.amount_paid_cents);
      gl_posting = await postInsuranceClaimRecovery({
        operating_company_id: query.data.operating_company_id,
        claim_id: params.data.id,
        actor_user_id: user.uuid,
        entry_date_iso: companyBusinessDate(),
        amount_paid_cents: paid,
      });
    }

    return gl_posting ? { ...updated.row, gl_posting } : updated.row;
  });
}
