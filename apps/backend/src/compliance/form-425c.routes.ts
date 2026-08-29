import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { registerComplianceRoutes } from "./compliance.routes.js";
import { buildForm425CPrintDocument, generateForm425CPdf, isInvalidCaseNumber } from "./form-425c-pdf.js";
import { registerShipperPortalRoutes } from "../shipper-portal/portal-auth.routes.js";
import { registerBorderCrossingHistoryRoutes } from "../border-crossing/border-crossing-history.routes.js";
import { registerBorderCrossingWizardRoutes } from "../border-crossing/border-crossing-wizard.routes.js";
import { registerDeadheadRoutes } from "../reports/deadhead.routes.js";
import { registerFaultRulesRoutes } from "../maintenance/fault-auto-wo/fault-rules.routes.js";
import { registerFaultHistoryRoutes } from "../maintenance/fault-auto-wo/fault-history.routes.js";
import { registerAutoWoDraftsRoutes } from "../maintenance/fault-auto-wo/auto-wo-drafts.routes.js";
import { registerForm2290Routes } from "./form-2290.routes.js";
import { registerDrugAlcoholComplianceRoutes } from "./drug-alcohol.routes.js";
import { registerCsaRoutes } from "./csa.routes.js";
import { registerFmcsaSaferRoutes } from "./fmcsa-safer.routes.js";
import { registerUsmcaCarrierBootstrapRoutes } from "../onboarding/usmca-carrier-bootstrap.routes.js";
import { registerLaunchToggleRoutes } from "../admin/launch-toggles.routes.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const COMPANY_QUERY = z.object({
  operating_company_id: z.string().uuid(),
});

const ID_PARAMS = z.object({
  id: z.string().uuid(),
});

const MONTH_QUERY = COMPANY_QUERY.extend({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const createSchema = COMPANY_QUERY.extend({
  reporting_month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  case_number: z.string().trim().min(1),
  court_district: z.string().trim().min(1),
  subchapter: z.enum(["V", "standard"]).default("V"),
  petition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const patchSchema = z
  .object({
    case_number: z.string().trim().min(1).optional(),
    court_district: z.string().trim().min(1).optional(),
    subchapter: z.enum(["V", "standard"]).optional(),
    petition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    part1_answers: z.record(z.string(), z.string()).optional(),
    part2_answers: z.record(z.string(), z.string()).optional(),
    line_24_payables: z.number().nullable().optional(),
    line_25_receivables: z.number().nullable().optional(),
    line_26_employees_at_filing: z.number().int().nullable().optional(),
    line_27_employees_now: z.number().int().nullable().optional(),
    line_28_bk_fees_this_month: z.number().nullable().optional(),
    line_29_bk_fees_since_filing: z.number().nullable().optional(),
    line_30_other_fees_this_month: z.number().nullable().optional(),
    line_31_other_fees_since_filing: z.number().nullable().optional(),
    line_32_proj_receipts: z.number().nullable().optional(),
    line_33_proj_disbursements: z.number().nullable().optional(),
    line_35_next_proj_receipts: z.number().nullable().optional(),
    line_36_next_proj_disbursements: z.number().nullable().optional(),
    projection_override_reason: z.string().trim().optional(),
  })
  .merge(COMPANY_QUERY);

const markFiledSchema = COMPANY_QUERY.extend({
  filed_at: z.string().datetime().optional(),
});

const exhibitSchema = COMPANY_QUERY.extend({
  line_number: z.number().int(),
  explanation: z.string().trim().min(3),
});

const attachmentParamsSchema = ID_PARAMS.extend({
  line: z.coerce.number().int().min(38).max(42),
});

const attachmentBodySchema = COMPANY_QUERY.extend({
  file_uuid: z.string().uuid(),
});

const profileSchema = COMPANY_QUERY.extend({
  company_key: z.enum(["trucking", "transportation"]),
  company_name: z.string().trim().min(1),
  case_number: z.string().default(""),
  district: z.string().default("Texas"),
  division: z.string().default("San Antonio"),
  judge: z.string().default(""),
  ein: z.string().default(""),
  filing_address: z.string().default(""),
  line_of_business: z.string().default(""),
  naisc_code: z.string().default(""),
  default_questionnaire_answers: z.record(z.string(), z.string()).default({}),
  bank_accounts: z.array(z.object({ id: z.string(), label: z.string(), number: z.string() })).default([]),
  petition_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function sendForm425CCompanyMissing(reply: FastifyReply) {
  return reply.code(404).send({
    error: "operating_company_not_found",
    message: "Operating company is missing or inactive — cannot load or save Form 425C profile",
  });
}

function sendForm425CForbiddenMembership(reply: FastifyReply) {
  return reply.code(403).send({
    error: "forbidden_company_membership",
    message: "Not a member of that operating company — Form 425C will not load another entity's filing",
  });
}

function sendForm425CAnswersIncomplete(reply: FastifyReply) {
  return reply.code(422).send({
    error: "form_425c_answers_incomplete",
    message: "Questionnaire lines 1–18 are not all answered — Generate will not invent Yes/No on a court filing",
  });
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

async function assertMutableForm425CReport(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  reportId: string,
  operatingCompanyId: string
) {
  const res = await client.query<{ status: string }>(
    `
      SELECT status
      FROM compliance.form_425c_reports
      WHERE id = $1
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [reportId, operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) throw new Error("form_425c_report_not_found");
  if (row.status === "filed") throw new Error("form_425c_filed_immutable");
}

function sendExhibitWriteError(reply: FastifyReply, err: unknown) {
  const e = err as { message?: string };
  if (e?.message === "form_425c_report_not_found") {
    return reply.code(404).send({ error: "report_not_found" });
  }
  if (e?.message === "form_425c_filed_immutable") {
    return reply.code(409).send({
      error: "form_425c_filed_immutable",
      message: "This MOR is filed — use Amend on History. Exhibit A/B will not rewrite a filed court filing.",
    });
  }
  if (e?.message === "form_425c_exhibit_insert_blocked") {
    return reply.code(404).send({ error: "exhibit_insert_blocked" });
  }
  if (e?.message === "forbidden_company_membership") {
    return sendForm425CForbiddenMembership(reply);
  }
  if (e?.message === "form_425c_operating_company_not_found") {
    return sendForm425CCompanyMissing(reply);
  }
  throw err;
}

function monthWindow(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const mon = Number(monthRaw);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  const prev = new Date(Date.UTC(year, mon - 2, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    prevMonthDate: prev.toISOString().slice(0, 10),
  };
}

type FilingProfileIdentity = {
  companyKey: "trucking" | "transportation";
  legalName: string;
  filingAddress: string;
};

async function filingProfileIdentity(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string
): Promise<FilingProfileIdentity> {
  const company = await client.query<{ code: string; legal_name: string; filing_address: string }>(
    `
      SELECT
        code,
        legal_name,
        concat_ws(', ', nullif(concat_ws(' ', address_line1, address_line2), ''), nullif(city, ''), nullif(concat_ws(' ', state, postal_code), '')) AS filing_address
      FROM org.companies
      WHERE id = $1::uuid
        -- is_active is UI-visibility only (0013). Pre-launch / hidden entities stay
        -- reachable for 425C setup — same as assertCompanyMembership. Deactivation
        -- (deactivated_at) is the only revoke. Gating is_active made USMCA look
        -- "not found" (404) while the user could still select it.
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const row = company.rows[0];
  if (!row) throw new Error("form_425c_operating_company_not_found");
  return {
    companyKey: row.code === "TRK" ? "trucking" : "transportation",
    legalName: row.legal_name,
    filingAddress: row.filing_address,
  };
}

async function ensureDefaultProfile(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string,
  userId: string
): Promise<FilingProfileIdentity> {
  const identity = await filingProfileIdentity(client, operatingCompanyId);
  await client.query(
      `
        INSERT INTO catalogs.form_425c_company_profiles (
          operating_company_id,
          company_key,
          company_name,
          district,
          division,
          filing_address,
          line_of_business,
          naisc_code,
          default_questionnaire_answers,
          bank_accounts,
          last_updated_by_user_id
        )
        VALUES ($1, $2, $3, '', '', $4, '', '', '{}'::jsonb, '[]'::jsonb, $5)
        ON CONFLICT (operating_company_id, company_key) DO UPDATE SET
          company_name = CASE
            WHEN catalogs.form_425c_company_profiles.company_name IN ('IH 35 TRUCKING LLC', 'IH 35 TRANSPORTATION LLC')
              AND catalogs.form_425c_company_profiles.company_name <> EXCLUDED.company_name
            THEN EXCLUDED.company_name
            ELSE catalogs.form_425c_company_profiles.company_name
          END,
          filing_address = CASE
            WHEN catalogs.form_425c_company_profiles.company_name IN ('IH 35 TRUCKING LLC', 'IH 35 TRANSPORTATION LLC')
              AND catalogs.form_425c_company_profiles.company_name <> EXCLUDED.company_name
            THEN EXCLUDED.filing_address
            ELSE catalogs.form_425c_company_profiles.filing_address
          END,
          district = CASE
            WHEN catalogs.form_425c_company_profiles.company_name IN ('IH 35 TRUCKING LLC', 'IH 35 TRANSPORTATION LLC')
              AND catalogs.form_425c_company_profiles.company_name <> EXCLUDED.company_name
              AND catalogs.form_425c_company_profiles.district = 'Texas'
            THEN ''
            ELSE catalogs.form_425c_company_profiles.district
          END,
          division = CASE
            WHEN catalogs.form_425c_company_profiles.company_name IN ('IH 35 TRUCKING LLC', 'IH 35 TRANSPORTATION LLC')
              AND catalogs.form_425c_company_profiles.company_name <> EXCLUDED.company_name
              AND catalogs.form_425c_company_profiles.division = 'San Antonio'
            THEN ''
            ELSE catalogs.form_425c_company_profiles.division
          END,
          bank_accounts = CASE
            WHEN catalogs.form_425c_company_profiles.company_name IN ('IH 35 TRUCKING LLC', 'IH 35 TRANSPORTATION LLC')
              AND catalogs.form_425c_company_profiles.company_name <> EXCLUDED.company_name
              AND catalogs.form_425c_company_profiles.bank_accounts IN (
                '[{"id":"WF-3500","label":"Wells Fargo – WF-3500","number":"xxxx3500"}]'::jsonb,
                '[{"id":"WF-1","label":"Wells Fargo – WF (Account 1)","number":"xxxx"},{"id":"WF-2","label":"Wells Fargo – WF (Account 2)","number":"xxxx"},{"id":"WF-3","label":"Wells Fargo – WF (Account 3)","number":"xxxx"}]'::jsonb
              )
            THEN '[]'::jsonb
            ELSE catalogs.form_425c_company_profiles.bank_accounts
          END,
          updated_at = now()
      `,
      [
        operatingCompanyId,
        identity.companyKey,
        identity.legalName,
        identity.filingAddress,
        userId,
      ]
  );
  return identity;
}

/**
 * MOR (UST Form 425C) court cash lines 19–23. COURT FILING — numbers must tie to the bank statements.
 *
 * REAL schema (db/migrations/0072,0073): amount_cents (bigint, Plaid-SIGNED: negative = money IN),
 * bank_account_id, transaction_date, is_credit. We compute receipts vs disbursements by GROUPING ON
 * `is_credit` (the canonical direction flag the GL poster trusts) — NEVER the amount_cents sign,
 * which is the OPPOSITE of a >0 test and would file receipts/disbursements SWAPPED on the court MOR.
 * Own-transfers between the debtor's own accounts are excluded (mirrors
 * bank-feed-gl-posting.service.ts:155 — review_state='transfer' / transfer_kind /
 * destination_bank_account_id) so inter-account moves don't inflate either line.
 *
 * FAIL-LOUD: no `.catch(() => zeros)`. A broken query THROWS (the caller returns a structured error)
 * rather than silently persisting $0 to a bankruptcy filing. Opening cash (line 19) carries forward
 * from the prior month's filed ending cash (line 23); the first filed month has no prior and anchors
 * at 0 until an owner-entered opening is set (see REPAIR spec §5.2 — deferred, no migration).
 *
 * NOTE on DIP-account scope: `is_dip`/`tag` do NOT exist on banking.bank_accounts (they were phantom).
 * Factoring/escrow are virtual-only rows that never exist as real bank_accounts, so scope = the
 * entity's real, non-virtual (`account_type NOT LIKE 'virtual_%'`) accounts. Narrowing to a curated
 * DIP-account list (form_425c_company_profiles.bank_accounts jsonb) is DEFERRED for Jorge/counsel to
 * confirm the exact filed accounts (REPAIR spec §5.3, Open Question 1) — do not treat this scope as
 * legally authoritative without that confirmation.
 */
export async function computeBankingSummary(client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, companyId: string, month: string) {
  const { startDate, endDate, prevMonthDate } = monthWindow(month);

  // Line 19 opening cash = prior month's filed ending cash (carry-forward, migration-free).
  const openingRes = await client.query<{ line_23_ending_cash: string | null }>(
    `
      SELECT line_23_ending_cash
      FROM compliance.form_425c_reports
      WHERE operating_company_id = $1::uuid
        AND reporting_month = $2::date
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [companyId, prevMonthDate]
  );

  const flowRes = await client.query<{ receipts_cents: string; disbursements_cents: string; in_scope_txn_count: string }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN bt.is_credit THEN abs(bt.amount_cents) END), 0)::bigint     AS receipts_cents,
        COALESCE(SUM(CASE WHEN NOT bt.is_credit THEN abs(bt.amount_cents) END), 0)::bigint AS disbursements_cents,
        COUNT(*)::int AS in_scope_txn_count
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts a ON a.id = bt.bank_account_id
      WHERE bt.operating_company_id = $1::uuid
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND bt.transaction_date >= $2::date
        AND bt.transaction_date <  $3::date
        AND bt.review_state IS DISTINCT FROM 'transfer'
        AND bt.transfer_kind IS NULL
        AND bt.destination_bank_account_id IS NULL
    `,
    [companyId, startDate, endDate]
  );

  const receiptsCents = Math.trunc(Number(flowRes.rows[0]?.receipts_cents ?? 0));
  const disbursementsCents = Math.trunc(Number(flowRes.rows[0]?.disbursements_cents ?? 0));
  const inScopeCount = Math.trunc(Number(flowRes.rows[0]?.in_scope_txn_count ?? 0));

  // Distinguish "0 because the month is genuinely dormant" (allowed) from "0 that would only occur if
  // the query silently failed" — the latter must never reach a court filing.
  if (inScopeCount > 0 && receiptsCents === 0 && disbursementsCents === 0) {
    throw new Error("mor_cash_zero_with_activity");
  }

  const line19 = Number(openingRes.rows[0]?.line_23_ending_cash ?? 0);
  const line20 = receiptsCents / 100;
  const line21 = disbursementsCents / 100;
  const line22 = line20 - line21;
  const line23 = line19 + line22;
  return {
    line_19_opening_cash: line19,
    line_20_receipts: line20,
    line_21_disbursements: line21,
    line_22_net_cash_flow: line22,
    line_23_ending_cash: line23,
    month: startDate.slice(0, 7),
  };
}

const REPORT_COLUMNS = [
  "case_number",
  "court_district",
  "subchapter",
  "petition_date",
  "part1_answers",
  "part2_answers",
  "line_24_payables",
  "line_25_receivables",
  "line_26_employees_at_filing",
  "line_27_employees_now",
  "line_28_bk_fees_this_month",
  "line_29_bk_fees_since_filing",
  "line_30_other_fees_this_month",
  "line_31_other_fees_since_filing",
  "line_32_proj_receipts",
  "line_33_proj_disbursements",
  "line_35_next_proj_receipts",
  "line_36_next_proj_disbursements",
] as const;

export async function registerForm425CRoutes(app: FastifyInstance) {
  await registerComplianceRoutes(app);
  await registerShipperPortalRoutes(app);
  await registerDeadheadRoutes(app);
  await registerBorderCrossingWizardRoutes(app);
  await registerBorderCrossingHistoryRoutes(app);
  await registerFaultRulesRoutes(app);
  await registerFaultHistoryRoutes(app);
  await registerAutoWoDraftsRoutes(app);
  await registerForm2290Routes(app);
  await registerDrugAlcoholComplianceRoutes(app);
  await registerCsaRoutes(app);
  await registerFmcsaSaferRoutes(app);
  await registerUsmcaCarrierBootstrapRoutes(app);
  await registerLaunchToggleRoutes(app);
  app.get("/api/v1/form-425c", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    try {
      const reports = await withCompanyScope(user.uuid, companyId, async (client) => {
        const res = await client.query(
          `
          SELECT id, reporting_month, status, petition_date, case_number, filed_at, filed_by_user_id, amended_from_uuid, created_at, updated_at
          FROM compliance.form_425c_reports
          WHERE operating_company_id = $1::uuid
          ORDER BY reporting_month DESC, created_at DESC
        `,
          [companyId]
        );
        return res.rows;
      });
      return { reports };
    } catch (err) {
      const e = err as { message?: string };
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      throw err;
    }
  });

  // Static paths MUST register before GET /:id. Fastify matches in order; otherwise
  // GET /form-425c/profiles and GET /form-425c/banking-summary bind as id="profiles"|"banking-summary",
  // fail UUID parse (400), and the Profiles / Import-from-Banking hops are dead.
  app.get("/api/v1/form-425c/profiles", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    try {
      const profiles = await withCompanyScope(user.uuid, companyId, async (client) => {
        const identity = await ensureDefaultProfile(client, companyId, user.uuid);
        const res = await client.query(
          `
          SELECT *
          FROM catalogs.form_425c_company_profiles
          WHERE operating_company_id = $1::uuid
            AND company_key = $2
          LIMIT 1
        `,
          [companyId, identity.companyKey]
        );
        return res.rows;
      });
      return { profiles };
    } catch (err) {
      const e = err as { message?: string };
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw err;
    }
  });

  app.get("/api/v1/form-425c/banking-summary", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = MONTH_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;
    try {
      return await withCompanyScope(user.uuid, q.operating_company_id, async (client) =>
        computeBankingSummary(client, q.operating_company_id, q.month)
      );
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      if (e?.message === "mor_cash_zero_with_activity") {
        return reply.code(422).send({
          error: "mor_cash_zero_with_activity",
          message:
            "Banking summary found in-scope transactions but $0 receipts and $0 disbursements — will not return $0 as court cash",
        });
      }
      req.log?.error?.({ err: e, month: q.month }, "form-425c banking-summary failed");
      return reply.code(502).send({
        error: "mor_cash_source_error",
        code: e?.code ?? null,
        message: e?.message ?? "banking summary query failed",
      });
    }
  });

  app.get("/api/v1/form-425c/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    let payload: { report: Record<string, unknown>; exhibit_a: unknown[]; exhibit_b: unknown[] } | null;
    try {
      payload = await withCompanyScope(user.uuid, companyId, async (client) => {
        const reportRes = await client.query(
          `
          SELECT *
          FROM compliance.form_425c_reports
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
          [params.data.id, companyId]
        );
        const report = reportRes.rows[0];
        if (!report) return null;
        const exhibitARes = await client.query(
          `
          SELECT *
          FROM compliance.form_425c_exhibit_a_entries
          WHERE report_id = $1
          ORDER BY line_number, created_at
        `,
          [params.data.id]
        );
        const exhibitBRes = await client.query(
          `
          SELECT *
          FROM compliance.form_425c_exhibit_b_entries
          WHERE report_id = $1
          ORDER BY line_number, created_at
        `,
          [params.data.id]
        );
        return { report, exhibit_a: exhibitARes.rows, exhibit_b: exhibitBRes.rows };
      });
    } catch (err) {
      const e = err as { message?: string };
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      throw err;
    }

    if (!payload) return reply.code(404).send({ error: "report_not_found" });
    return payload;
  });

  app.get("/api/v1/form-425c/:id/filing-html", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    try {
      return await withCompanyScope(user.uuid, companyId, async (client) => {
        const built = await buildForm425CPrintDocument({
          client,
          reportId: params.data.id,
          operatingCompanyId: companyId,
        });
        return { print_html: built.printHtml, suggested_filename: built.suggestedFilename };
      });
    } catch (err) {
      const e = err as { message?: string };
      if (e?.message === "form_425c_report_not_found") {
        return reply.code(404).send({ error: "report_not_found" });
      }
      if (e?.message === "form_425c_profile_required") {
        return reply.code(422).send({
          error: "form_425c_profile_required",
          message: "This entity has no Form 425C profile (or no company name). Set Profiles & Defaults before printing — Generate will not invent a debtor name.",
        });
      }
      if (e?.message === "form_425c_answers_incomplete") {
        return sendForm425CAnswersIncomplete(reply);
      }
      if (e?.message === "form_425c_case_number_required") {
        return reply.code(422).send({
          error: "case_number_required",
          message: "This entity's bankruptcy case number is not set (or is a placeholder). Set the real case number in Profiles & Defaults before printing.",
        });
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw err;
    }
  });

  app.post("/api/v1/form-425c/profiles", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = profileSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    let result: { kind: "company_key_mismatch" } | { kind: "profile"; profile: Record<string, unknown> };
    try {
    result = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const identity = await filingProfileIdentity(client, b.operating_company_id);
      if (b.company_key !== identity.companyKey) {
        return { kind: "company_key_mismatch" as const };
      }
      const res = await client.query(
        `
          INSERT INTO catalogs.form_425c_company_profiles (
            operating_company_id,
            company_key,
            company_name,
            case_number,
            district,
            division,
            judge,
            ein,
            filing_address,
            line_of_business,
            naisc_code,
            default_questionnaire_answers,
            bank_accounts,
            petition_date,
            last_updated_at,
            last_updated_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::date, now(), $15)
          ON CONFLICT (operating_company_id, company_key)
          DO UPDATE SET
            company_name = EXCLUDED.company_name,
            case_number = EXCLUDED.case_number,
            district = EXCLUDED.district,
            division = EXCLUDED.division,
            judge = EXCLUDED.judge,
            ein = EXCLUDED.ein,
            filing_address = EXCLUDED.filing_address,
            line_of_business = EXCLUDED.line_of_business,
            naisc_code = EXCLUDED.naisc_code,
            default_questionnaire_answers = EXCLUDED.default_questionnaire_answers,
            bank_accounts = EXCLUDED.bank_accounts,
            petition_date = EXCLUDED.petition_date,
            last_updated_at = now(),
            last_updated_by_user_id = EXCLUDED.last_updated_by_user_id,
            updated_at = now()
          RETURNING *
        `,
        [
          b.operating_company_id,
          b.company_key,
          b.company_name,
          b.case_number,
          b.district,
          b.division,
          b.judge,
          b.ein,
          b.filing_address,
          b.line_of_business,
          b.naisc_code,
          JSON.stringify(b.default_questionnaire_answers ?? {}),
          JSON.stringify(b.bank_accounts ?? []),
          b.petition_date ?? null,
          user.uuid,
        ]
      );
      return { kind: "profile" as const, profile: res.rows[0] };
    });
    } catch (err) {
      const e = err as { message?: string };
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw err;
    }

    if (result.kind === "company_key_mismatch") {
      return reply.code(400).send({ error: "form_425c_profile_company_key_mismatch" });
    }
    return reply.code(201).send(result.profile);
  });

  app.post("/api/v1/form-425c", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;
    const reportingMonth = b.reporting_month.length === 7 ? `${b.reporting_month}-01` : b.reporting_month;
    const { prevMonthDate } = monthWindow(reportingMonth.slice(0, 7));

    let created: Record<string, unknown> | { error: "petition_date_required" } | null;
    try {
    created = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      await ensureDefaultProfile(client, b.operating_company_id, user.uuid);

      // Case petition date is a single source of truth for the Ch.11 case — never invent a literal.
      // Prefer the petition_date already recorded on any prior report for this entity; otherwise require body.
      const casePetitionRes = await client.query<{ petition_date: string }>(
        `
          SELECT petition_date::text AS petition_date
          FROM compliance.form_425c_reports
          WHERE operating_company_id = $1::uuid
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [b.operating_company_id]
      );
      const casePetitionDate = casePetitionRes.rows[0]?.petition_date?.slice(0, 10) ?? null;
      const petitionDate = casePetitionDate ?? b.petition_date;
      if (!petitionDate || !/^\d{4}-\d{2}-\d{2}$/.test(petitionDate)) {
        return { error: "petition_date_required" as const };
      }

      const existingDraft = await client.query<{ id: string }>(
        `
          SELECT id
          FROM compliance.form_425c_reports
          WHERE operating_company_id = $1::uuid
            AND reporting_month = $2::date
            AND status <> 'filed'
          LIMIT 1
        `,
        [b.operating_company_id, reportingMonth]
      );
      if (existingDraft.rows[0]) {
        throw new Error("form_425c_period_draft_exists");
      }

      const prevRes = await client.query(
        `
          SELECT id, line_35_next_proj_receipts, line_36_next_proj_disbursements, line_37_next_proj_net_cash_flow
          FROM compliance.form_425c_reports
          WHERE operating_company_id = $1::uuid
            AND reporting_month = $2::date
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [b.operating_company_id, prevMonthDate]
      );
      const prev = prevRes.rows[0];
      const optionalNumeric = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const line32 = optionalNumeric(prev?.line_35_next_proj_receipts);
      const line33 = optionalNumeric(prev?.line_36_next_proj_disbursements);
      const line34 = line32 !== null && line33 !== null ? line32 - line33 : null;

      const insertRes = await client.query(
        `
          INSERT INTO compliance.form_425c_reports (
            operating_company_id,
            reporting_month,
            case_number,
            court_district,
            subchapter,
            petition_date,
            line_32_proj_receipts,
            line_33_proj_disbursements,
            line_34_proj_net_cash_flow,
            carry_forward_source_report_id
          )
          VALUES ($1, $2::date, $3, $4, $5, $6::date, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          b.operating_company_id,
          reportingMonth,
          b.case_number,
          b.court_district,
          b.subchapter,
          petitionDate,
          line32,
          line33,
          line34,
          prev?.id ?? null,
        ]
      );
      const report = insertRes.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.form_425c.created",
        {
          resource_type: "compliance.form_425c_reports",
          resource_id: report.id,
          operating_company_id: b.operating_company_id,
          reporting_month: reportingMonth,
          carry_forward_source_report_id: prev?.id ?? null,
        },
        "info",
        "BT-3-FORM-425C"
      );
      return report;
    });
    } catch (err) {
      const e = err as { message?: string; code?: string; cause?: { code?: string } };
      if (e?.message === "form_425c_period_draft_exists" || e?.code === "23505" || e?.cause?.code === "23505") {
        return reply.code(409).send({
          error: "form_425c_period_draft_exists",
          message: "A draft already exists for this period — use Load Draft. Create will not insert a second MOR.",
        });
      }
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw err;
    }
    if (created && typeof created === "object" && "error" in created && created.error === "petition_date_required") {
      return reply.code(400).send({
        error: "petition_date_required",
        message:
          "petition_date (YYYY-MM-DD) is required when no prior Form 425C report exists for this company. Set it on Profiles & Defaults — never hardcode.",
      });
    }
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/form-425c/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = patchSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    let updated: Record<string, unknown> | null;
    try {
      updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const currentRes = await client.query(
        `
          SELECT *
          FROM compliance.form_425c_reports
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, b.operating_company_id]
      );
      const current = currentRes.rows[0];
      if (!current) return null;
      if (current.status === "filed") {
        throw new Error("form_425c_filed_immutable");
      }

      const updates: string[] = [];
      const values: unknown[] = [params.data.id, b.operating_company_id];
      for (const col of REPORT_COLUMNS) {
        const val = (b as Record<string, unknown>)[col];
        if (val !== undefined) {
          values.push(val);
          updates.push(`${col} = $${values.length}`);
        }
      }

      const incoming32 = b.line_32_proj_receipts;
      const incoming33 = b.line_33_proj_disbursements;
      const optionalNumeric = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const next32 = incoming32 !== undefined ? optionalNumeric(incoming32) : optionalNumeric(current.line_32_proj_receipts);
      const next33 = incoming33 !== undefined ? optionalNumeric(incoming33) : optionalNumeric(current.line_33_proj_disbursements);
      const next35 = b.line_35_next_proj_receipts !== undefined
        ? optionalNumeric(b.line_35_next_proj_receipts)
        : optionalNumeric(current.line_35_next_proj_receipts);
      const next36 = b.line_36_next_proj_disbursements !== undefined
        ? optionalNumeric(b.line_36_next_proj_disbursements)
        : optionalNumeric(current.line_36_next_proj_disbursements);
      const projChanged =
        next32 !== optionalNumeric(current.line_32_proj_receipts) ||
        next33 !== optionalNumeric(current.line_33_proj_disbursements);
      if (projChanged && current.carry_forward_source_report_id) {
        const reason = String(b.projection_override_reason ?? "").trim();
        if (reason.length < 30) {
          throw new Error("projection_override_reason_required_min_30_chars");
        }
        values.push(reason);
        updates.push(`projection_override_reason = $${values.length}`);
        values.push(user.uuid);
        updates.push(`projection_override_by_user_id = $${values.length}`);
        updates.push(`projection_override_at = now()`);
      }

      values.push(next32 !== null && next33 !== null ? next32 - next33 : null);
      updates.push(`line_34_proj_net_cash_flow = $${values.length}`);

      values.push(next35 !== null && next36 !== null ? next35 - next36 : null);
      updates.push(`line_37_next_proj_net_cash_flow = $${values.length}`);

      if (updates.length === 0) return current;
      const updateRes = await client.query(
        `
          UPDATE compliance.form_425c_reports
          SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND status <> 'filed'
          RETURNING *
        `,
        values
      );
      const report = updateRes.rows[0];
      if (!report) throw new Error("form_425c_filed_immutable");
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.form_425c.draft_saved",
        {
          resource_type: "compliance.form_425c_reports",
          resource_id: params.data.id,
          operating_company_id: b.operating_company_id,
          updated_fields: updates,
        },
        "info",
        "BT-3-FORM-425C"
      );
      return report;
    });
    } catch (error) {
      const msg = (error as Error).message;
      if (msg === "projection_override_reason_required_min_30_chars") {
        return reply.code(422).send({
          error: "projection_override_reason_required_min_30_chars",
          message: "Carry-forward override needs a reason of at least 30 characters",
        });
      }
      if (msg === "form_425c_filed_immutable") {
        return reply.code(409).send({
          error: "form_425c_filed_immutable",
          message: "This MOR is filed — use Amend on History to create a draft. Save Draft will not rewrite a filed court filing.",
        });
      }
      if (msg === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw error;
    }

    if (!updated) return reply.code(404).send({ error: "report_not_found" });
    return updated;
  });

  app.post("/api/v1/form-425c/:id/import-banking", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = COMPANY_QUERY.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    // FAIL-LOUD: never persist a silently-guessed $0 to a court filing. If the banking source query
    // throws (e.g. a schema drift), surface a structured 502 and write NOTHING — the withCompanyScope
    // transaction rolls back, so lines 19–23 are left untouched rather than zeroed. (REPAIR spec §4.)
    let updated: Record<string, unknown> | null;
    try {
      updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
        const reportRes = await client.query<{ reporting_month: string; status: string }>(
          `
            SELECT reporting_month::text, status
            FROM compliance.form_425c_reports
            WHERE id = $1
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, b.operating_company_id]
        );
        const report = reportRes.rows[0];
        if (!report) return null;
        if (report.status === "filed") {
          throw new Error("form_425c_filed_immutable");
        }
        const summary = await computeBankingSummary(client, b.operating_company_id, String(report.reporting_month).slice(0, 7));
        const res = await client.query(
          `
            UPDATE compliance.form_425c_reports
            SET line_19_opening_cash = $3,
                line_20_receipts = $4,
                line_21_disbursements = $5,
                line_22_net_cash_flow = $6,
                line_23_ending_cash = $7,
                banking_imported_at = now(),
                banking_imported_by_user_id = $8,
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND status <> 'filed'
            RETURNING *
          `,
          [
            params.data.id,
            b.operating_company_id,
            summary.line_19_opening_cash,
            summary.line_20_receipts,
            summary.line_21_disbursements,
            summary.line_22_net_cash_flow,
            summary.line_23_ending_cash,
            user.uuid,
          ]
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "compliance.form_425c.banking_imported",
          {
            resource_type: "compliance.form_425c_reports",
            resource_id: params.data.id,
            operating_company_id: b.operating_company_id,
            summary,
          },
          "info",
          "BT-3-FORM-425C"
        );
        if (!res.rows[0]) throw new Error("form_425c_filed_immutable");
        return res.rows[0] as Record<string, unknown>;
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e?.message === "mor_cash_zero_with_activity") {
        return reply.code(422).send({
          error: "mor_cash_zero_with_activity",
          message:
            "Banking import found in-scope transactions but $0 receipts and $0 disbursements — will not write $0 onto a court filing",
        });
      }
      if (e?.message === "form_425c_filed_immutable") {
        return reply.code(409).send({
          error: "form_425c_filed_immutable",
          message: "This MOR is filed — use Amend on History. Import from Banking will not rewrite a filed court filing.",
        });
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      req.log?.error?.({ err: e, reportId: params.data.id }, "form-425c import-banking failed");
      // Surface the pg error code/message only (never connection strings). Nothing was persisted.
      return reply.code(502).send({
        error: "mor_cash_source_error",
        code: e?.code ?? null,
        message: e?.message ?? "banking summary query failed",
      });
    }
    if (!updated) return reply.code(404).send({ error: "report_not_found" });
    return updated;
  });

  app.post("/api/v1/form-425c/:id/generate-filing-pdf", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = COMPANY_QUERY.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    let payload: Record<string, unknown> | null;
    try {
      payload = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
        const currentRes = await client.query<{ status: string }>(
          `
            SELECT status
            FROM compliance.form_425c_reports
            WHERE id = $1
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, b.operating_company_id]
        );
        const current = currentRes.rows[0];
        if (!current) throw new Error("form_425c_report_not_found");
        if (current.status === "filed") throw new Error("form_425c_filed_immutable");
        const generated = await generateForm425CPdf({
          client,
          userId: user.uuid,
          reportId: params.data.id,
          operatingCompanyId: b.operating_company_id,
        });
        const reportRes = await client.query(
          `
            UPDATE compliance.form_425c_reports
            SET filed_pdf_uuid = $3,
                status = 'ready_to_file',
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND status <> 'filed'
            RETURNING *
          `,
          [params.data.id, b.operating_company_id, generated.fileId]
        );
        const report = reportRes.rows[0];
        if (!report) return null;
        await appendCrudAudit(
          client,
          user.uuid,
          "compliance.form_425c.pdf_generated",
          {
            resource_type: "compliance.form_425c_reports",
            resource_id: params.data.id,
            operating_company_id: b.operating_company_id,
            filed_pdf_uuid: generated.fileId,
            sha256: generated.sha256,
          },
          "info",
          "BT-3-FORM-425C"
        );
        return {
          filing_record_id: generated.filingRecordId,
          docs_file_id: generated.fileId,
          print_html: generated.printHtml,
          suggested_filename: generated.suggestedFilename,
          report,
        };
      });
    } catch (err) {
      const e = err as { message?: string };
      if (e?.message === "form_425c_case_number_required") {
        return reply.code(422).send({
          error: "case_number_required",
          message: "This entity's bankruptcy case number is not set (or is a placeholder). Set the real case number in Profiles & Defaults before generating a filing PDF.",
        });
      }
      if (e?.message === "form_425c_profile_required") {
        return reply.code(422).send({
          error: "form_425c_profile_required",
          message: "This entity has no Form 425C profile (or no company name). Set Profiles & Defaults before Generate — a court PDF will not invent a debtor name.",
        });
      }
      if (e?.message === "form_425c_answers_incomplete") {
        return sendForm425CAnswersIncomplete(reply);
      }
      if (e?.message === "form_425c_operating_company_not_found") {
        return sendForm425CCompanyMissing(reply);
      }
      if (e?.message === "form_425c_report_not_found") {
        return reply.code(404).send({ error: "report_not_found" });
      }
      if (e?.message === "form_425c_filed_immutable") {
        return reply.code(409).send({
          error: "form_425c_filed_immutable",
          message: "This MOR is filed — use Amend on History. Generate will not un-file a court filing.",
        });
      }
      if (e?.message === "form_425c_filing_file_insert_failed") {
        return reply.code(502).send({
          error: "form_425c_filing_file_insert_failed",
          message: "Generate could not write the filing snapshot — status was not set to ready to file",
        });
      }
      if (e?.message === "form_425c_r2_not_configured" || e?.message === "form_425c_r2_put_failed") {
        return reply.code(502).send({
          error: e.message,
          message: "Generate could not store the filing snapshot in object storage — status was not set to ready to file",
        });
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw err;
    }
    if (!payload) return reply.code(404).send({ error: "report_not_found" });
    return payload;
  });

  app.post("/api/v1/form-425c/:id/mark-filed", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = markFiledSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    let updated: Record<string, unknown> | { caseNumberInvalid: true } | null;
    try {
      updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
        const existingRes = await client.query<{ case_number: string | null; status: string; filed_pdf_uuid: string | null }>(
          `SELECT case_number, status, filed_pdf_uuid FROM compliance.form_425c_reports WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
          [params.data.id, b.operating_company_id]
        );
        const existing = existingRes.rows[0];
        if (!existing) return null;
        if (existing.status === "filed") {
          throw new Error("form_425c_filed_immutable");
        }
        if (!existing.filed_pdf_uuid) {
          throw new Error("form_425c_generate_required");
        }
        if (isInvalidCaseNumber(existing.case_number)) {
          return { caseNumberInvalid: true } as const;
        }
        const res = await client.query(
          `
          UPDATE compliance.form_425c_reports
          SET status = 'filed',
              filed_at = COALESCE($3::timestamptz, now()),
              filed_by_user_id = $4,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND filed_pdf_uuid IS NOT NULL
            AND status IN ('draft', 'ready_to_file', 'amended')
          RETURNING *
        `,
          [params.data.id, b.operating_company_id, b.filed_at ?? null, user.uuid]
        );
        const report = res.rows[0];
        if (!report) return null;
        await appendCrudAudit(
          client,
          user.uuid,
          "compliance.form_425c.filed",
          {
            resource_type: "compliance.form_425c_reports",
            resource_id: params.data.id,
            operating_company_id: b.operating_company_id,
          },
          "info",
          "BT-3-FORM-425C"
        );
        return report;
      });
    } catch (err) {
      const e = err as { message?: string };
      if (e?.message === "form_425c_filed_immutable") {
        return reply.code(409).send({
          error: "form_425c_filed_immutable",
          message: "This MOR is filed — use Amend on History. Mark Filed will not rewrite a filed court filing.",
        });
      }
      if (e?.message === "form_425c_generate_required") {
        return reply.code(422).send({
          error: "form_425c_generate_required",
          message: "Generate the filing PDF before marking filed — a draft with no snapshot is not a court filing",
        });
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw err;
    }
    if (!updated) return reply.code(404).send({ error: "report_not_found" });
    if ((updated as { caseNumberInvalid?: boolean }).caseNumberInvalid) {
      return reply.code(422).send({
        error: "case_number_required",
        message: "This entity's bankruptcy case number is not set (or is a placeholder). Set the real case number in Profiles & Defaults before marking this report filed.",
      });
    }
    return updated;
  });

  app.post("/api/v1/form-425c/:id/amend", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = COMPANY_QUERY.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    let amended: Record<string, unknown> | null;
    try {
    amended = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const srcRes = await client.query(
        `
          SELECT *
          FROM compliance.form_425c_reports
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, b.operating_company_id]
      );
      const src = srcRes.rows[0];
      if (!src) return null;
      if (src.status !== "filed") {
        throw new Error("form_425c_amend_source_not_filed");
      }
      const openRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM compliance.form_425c_reports
          WHERE operating_company_id = $1::uuid
            AND reporting_month = $2
            AND status <> 'filed'
          LIMIT 1
        `,
        [b.operating_company_id, src.reporting_month]
      );
      if (openRes.rows[0]) {
        throw new Error("form_425c_amendment_already_open");
      }
      const res = await client.query(
        `
          INSERT INTO compliance.form_425c_reports (
            operating_company_id,
            reporting_month,
            case_number,
            court_district,
            subchapter,
            petition_date,
            part1_answers,
            part2_answers,
            line_19_opening_cash,
            line_20_receipts,
            line_21_disbursements,
            line_22_net_cash_flow,
            line_23_ending_cash,
            line_24_payables,
            line_25_receivables,
            line_26_employees_at_filing,
            line_27_employees_now,
            line_28_bk_fees_this_month,
            line_29_bk_fees_since_filing,
            line_30_other_fees_this_month,
            line_31_other_fees_since_filing,
            line_32_proj_receipts,
            line_33_proj_disbursements,
            line_34_proj_net_cash_flow,
            line_35_next_proj_receipts,
            line_36_next_proj_disbursements,
            line_37_next_proj_net_cash_flow,
            attachment_38_bank_statements_uuids,
            attachment_39_recon_reports_uuids,
            attachment_40_financial_reports_uuids,
            attachment_41_budget_uuids,
            attachment_42_job_costing_uuids,
            status,
            amended_from_uuid,
            carry_forward_source_report_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
            $28, $29, $30, $31, $32, 'draft', $33, $34
          )
          RETURNING *
        `,
        [
          src.operating_company_id,
          src.reporting_month,
          src.case_number,
          src.court_district,
          src.subchapter,
          src.petition_date,
          src.part1_answers,
          src.part2_answers,
          src.line_19_opening_cash,
          src.line_20_receipts,
          src.line_21_disbursements,
          src.line_22_net_cash_flow,
          src.line_23_ending_cash,
          src.line_24_payables,
          src.line_25_receivables,
          src.line_26_employees_at_filing,
          src.line_27_employees_now,
          src.line_28_bk_fees_this_month,
          src.line_29_bk_fees_since_filing,
          src.line_30_other_fees_this_month,
          src.line_31_other_fees_since_filing,
          src.line_32_proj_receipts,
          src.line_33_proj_disbursements,
          src.line_34_proj_net_cash_flow,
          src.line_35_next_proj_receipts,
          src.line_36_next_proj_disbursements,
          src.line_37_next_proj_net_cash_flow,
          src.attachment_38_bank_statements_uuids ?? [],
          src.attachment_39_recon_reports_uuids ?? [],
          src.attachment_40_financial_reports_uuids ?? [],
          src.attachment_41_budget_uuids ?? [],
          src.attachment_42_job_costing_uuids ?? [],
          src.id,
          src.carry_forward_source_report_id ?? null,
        ]
      );
      const report = res.rows[0];
      if (!report) return null;
      await client.query(
        `
          INSERT INTO compliance.form_425c_exhibit_a_entries (report_id, line_number, explanation)
          SELECT $1, line_number, explanation
          FROM compliance.form_425c_exhibit_a_entries
          WHERE report_id = $2
          ORDER BY created_at
        `,
        [report.id, src.id]
      );
      await client.query(
        `
          INSERT INTO compliance.form_425c_exhibit_b_entries (report_id, line_number, explanation)
          SELECT $1, line_number, explanation
          FROM compliance.form_425c_exhibit_b_entries
          WHERE report_id = $2
          ORDER BY created_at
        `,
        [report.id, src.id]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.form_425c.amended",
        {
          resource_type: "compliance.form_425c_reports",
          resource_id: report.id,
          operating_company_id: b.operating_company_id,
          amended_from_uuid: src.id,
        },
        "info",
        "BT-3-FORM-425C"
      );
      return report;
    });
    } catch (err) {
      const e = err as { message?: string; code?: string; cause?: { code?: string } };
      if (e?.message === "form_425c_amend_source_not_filed") {
        return reply.code(409).send({
          error: "form_425c_amend_source_not_filed",
          message: "Only a filed MOR can be amended. Open the draft on History.",
        });
      }
      if (e?.message === "form_425c_amendment_already_open" || e?.code === "23505" || e?.cause?.code === "23505") {
        return reply.code(409).send({
          error: "form_425c_amendment_already_open",
          message: "An amendment draft already exists for this period — Open it on History. Amend will not create a second draft.",
        });
      }
      if (e?.message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw err;
    }
    if (!amended) return reply.code(404).send({ error: "report_not_found" });
    return reply.code(201).send(amended);
  });

  app.post("/api/v1/form-425c/:id/exhibit-a", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = exhibitSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    if (body.data.line_number < 1 || body.data.line_number > 9) return reply.code(400).send({ error: "line_number_must_be_1_to_9" });
    const b = body.data;

    try {
      const created = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
        await assertMutableForm425CReport(client, params.data.id, b.operating_company_id);
        const res = await client.query(
          `
            INSERT INTO compliance.form_425c_exhibit_a_entries (report_id, line_number, explanation)
            VALUES ($1, $2, $3)
            RETURNING *
          `,
          [params.data.id, b.line_number, b.explanation]
        );
        if (!res.rows[0]) throw new Error("form_425c_exhibit_insert_blocked");
        await appendCrudAudit(
          client,
          user.uuid,
          "compliance.form_425c.draft_saved",
          {
            resource_type: "compliance.form_425c_exhibit_a_entries",
            resource_id: res.rows[0].id,
            operating_company_id: b.operating_company_id,
            report_id: params.data.id,
            line_number: b.line_number,
          },
          "info",
          "BT-3-FORM-425C"
        );
        return res.rows[0];
      });
      return reply.code(201).send(created);
    } catch (err) {
      return sendExhibitWriteError(reply, err);
    }
  });

  app.post("/api/v1/form-425c/:id/exhibit-b", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = exhibitSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    if (body.data.line_number < 10 || body.data.line_number > 18) return reply.code(400).send({ error: "line_number_must_be_10_to_18" });
    const b = body.data;

    try {
      const created = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
        await assertMutableForm425CReport(client, params.data.id, b.operating_company_id);
        const res = await client.query(
          `
            INSERT INTO compliance.form_425c_exhibit_b_entries (report_id, line_number, explanation)
            VALUES ($1, $2, $3)
            RETURNING *
          `,
          [params.data.id, b.line_number, b.explanation]
        );
        if (!res.rows[0]) throw new Error("form_425c_exhibit_insert_blocked");
        await appendCrudAudit(
          client,
          user.uuid,
          "compliance.form_425c.draft_saved",
          {
            resource_type: "compliance.form_425c_exhibit_b_entries",
            resource_id: res.rows[0].id,
            operating_company_id: b.operating_company_id,
            report_id: params.data.id,
            line_number: b.line_number,
          },
          "info",
          "BT-3-FORM-425C"
        );
        return res.rows[0];
      });
      return reply.code(201).send(created);
    } catch (err) {
      return sendExhibitWriteError(reply, err);
    }
  });

  app.post("/api/v1/form-425c/:id/attachments/:line", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = attachmentParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = attachmentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;
    const line = params.data.line;
    const colMap: Record<number, string> = {
      38: "attachment_38_bank_statements_uuids",
      39: "attachment_39_recon_reports_uuids",
      40: "attachment_40_financial_reports_uuids",
      41: "attachment_41_budget_uuids",
      42: "attachment_42_job_costing_uuids",
    };
    const col = colMap[line];

    let updated: Record<string, unknown> | null = null;
    try {
    updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const fileRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM docs.files
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [b.file_uuid, b.operating_company_id]
      );
      if (!fileRes.rows[0]) throw new Error("file_not_found");
      await assertMutableForm425CReport(client, params.data.id, b.operating_company_id);
      const res = await client.query(
        `
          UPDATE compliance.form_425c_reports
          SET ${col} = (
                SELECT ARRAY(
                  SELECT DISTINCT v
                  FROM unnest(COALESCE(${col}, '{}'::uuid[]) || $3::uuid) AS t(v)
                )
              ),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND status <> 'filed'
          RETURNING *
        `,
        [params.data.id, b.operating_company_id, b.file_uuid]
      );
      const report = res.rows[0];
      if (!report) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.form_425c.draft_saved",
        {
          resource_type: "compliance.form_425c_reports",
          resource_id: params.data.id,
          operating_company_id: b.operating_company_id,
          attachment_line: line,
          file_uuid: b.file_uuid,
        },
        "info",
        "BT-3-FORM-425C"
      );
      return report;
    });
    } catch (error) {
      if ((error as Error).message === "file_not_found") {
        return reply.code(404).send({
          error: "file_not_found",
          message: "Attachment file UUID not found for this operating company",
        });
      }
      if ((error as Error).message === "form_425c_filed_immutable") {
        return reply.code(409).send({
          error: "form_425c_filed_immutable",
          message: "This MOR is filed — use Amend on History. Attachments will not rewrite a filed court filing.",
        });
      }
      if ((error as Error).message === "form_425c_report_not_found") {
        return reply.code(404).send({ error: "report_not_found" });
      }
      if ((error as Error).message === "forbidden_company_membership") {
        return sendForm425CForbiddenMembership(reply);
      }
      throw error;
    }
    if (!updated) return reply.code(404).send({ error: "report_not_found" });
    return updated;
  });
}
