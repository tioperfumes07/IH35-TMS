import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { registerComplianceRoutes } from "./compliance.routes.js";
import { generateForm425CPdf } from "./form-425c-pdf.js";
import { registerShipperPortalRoutes } from "../shipper-portal/portal-auth.routes.js";
import { registerBorderCrossingHistoryRoutes } from "../border-crossing/border-crossing-history.routes.js";
import { registerBorderCrossingWizardRoutes } from "../border-crossing/border-crossing-wizard.routes.js";
import { registerDeadheadRoutes } from "../reports/deadhead.routes.js";

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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
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

async function ensureDefaultProfiles(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string,
  userId: string
) {
  const defaultAnswers = {
    "1": "yes",
    "2": "yes",
    "3": "yes",
    "4": "yes",
    "5": "yes",
    "6": "yes",
    "7": "yes",
    "8": "yes",
    "9": "yes",
    "10": "no",
    "11": "no",
    "12": "no",
    "13": "no",
    "14": "no",
    "15": "no",
    "16": "no",
    "17": "no",
    "18": "no",
  };
  const rows = [
    {
      company_key: "trucking",
      company_name: "IH 35 TRUCKING LLC",
      line_of_business: "Freight Trucking",
      naisc_code: "484121",
      bank_accounts: [{ id: "WF-3500", label: "Wells Fargo – WF-3500", number: "xxxx3500" }],
    },
    {
      company_key: "transportation",
      company_name: "IH 35 TRANSPORTATION LLC",
      line_of_business: "Transportation",
      naisc_code: "485",
      bank_accounts: [
        { id: "WF-1", label: "Wells Fargo – WF (Account 1)", number: "xxxx" },
        { id: "WF-2", label: "Wells Fargo – WF (Account 2)", number: "xxxx" },
        { id: "WF-3", label: "Wells Fargo – WF (Account 3)", number: "xxxx" },
      ],
    },
  ];
  for (const row of rows) {
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
        VALUES ($1, $2, $3, 'Texas', 'San Antonio', 'Laredo, TX 78041', $4, $5, $6::jsonb, $7::jsonb, $8)
        ON CONFLICT (operating_company_id, company_key) DO NOTHING
      `,
      [
        operatingCompanyId,
        row.company_key,
        row.company_name,
        row.line_of_business,
        row.naisc_code,
        JSON.stringify(defaultAnswers),
        JSON.stringify(row.bank_accounts),
        userId,
      ]
    );
  }
}

async function computeBankingSummary(client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, companyId: string, month: string) {
  const { startDate, endDate } = monthWindow(month);
  const openingRes = await client.query<{ amount: number }>(
    `
      SELECT COALESCE(SUM(COALESCE(bb.current_balance, 0)), 0)::numeric AS amount
      FROM banking.bank_accounts a
      LEFT JOIN LATERAL (
        SELECT b.current_balance
        FROM banking.bank_account_balances b
        WHERE b.account_id = a.id
          AND b.computed_at < $2::date
        ORDER BY b.computed_at DESC
        LIMIT 1
      ) bb ON TRUE
      WHERE a.operating_company_id = $1
        AND a.is_dip = true
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND COALESCE(a.tag, '') NOT IN ('Factoring', 'Escrow')
    `,
    [companyId, startDate]
  ).catch(() => ({ rows: [{ amount: 0 }] }));

  const flowRes = await client.query<{ receipts: number; disbursements: number }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN bt.amount > 0 THEN bt.amount ELSE 0 END), 0)::numeric AS receipts,
        COALESCE(SUM(CASE WHEN bt.amount < 0 THEN abs(bt.amount) ELSE 0 END), 0)::numeric AS disbursements
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts a ON a.id = bt.account_id
      WHERE bt.operating_company_id = $1
        AND a.is_dip = true
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND COALESCE(a.tag, '') NOT IN ('Factoring', 'Escrow')
        AND bt.txn_date >= $2::date
        AND bt.txn_date < $3::date
    `,
    [companyId, startDate, endDate]
  ).catch(() => ({ rows: [{ receipts: 0, disbursements: 0 }] }));

  const line19 = Number(openingRes.rows[0]?.amount ?? 0);
  const line20 = Number(flowRes.rows[0]?.receipts ?? 0);
  const line21 = Number(flowRes.rows[0]?.disbursements ?? 0);
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
  app.get("/api/v1/form-425c", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const reports = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT id, reporting_month, status, filed_at, filed_by_user_id, amended_from_uuid, created_at, updated_at
          FROM compliance.form_425c_reports
          WHERE operating_company_id = $1
          ORDER BY reporting_month DESC, created_at DESC
        `,
        [companyId]
      );
      return res.rows;
    });
    return { reports };
  });

  app.get("/api/v1/form-425c/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const reportRes = await client.query(
        `
          SELECT *
          FROM compliance.form_425c_reports
          WHERE id = $1
            AND operating_company_id = $2
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

    if (!payload) return reply.code(404).send({ error: "report_not_found" });
    return payload;
  });

  app.get("/api/v1/form-425c/profiles", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const profiles = await withCompanyScope(user.uuid, companyId, async (client) => {
      await ensureDefaultProfiles(client, companyId, user.uuid);
      const res = await client.query(
        `
          SELECT *
          FROM catalogs.form_425c_company_profiles
          WHERE operating_company_id = $1
          ORDER BY CASE company_key WHEN 'trucking' THEN 1 ELSE 2 END
        `,
        [companyId]
      );
      return res.rows;
    });
    return { profiles };
  });

  app.post("/api/v1/form-425c/profiles", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = profileSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const profile = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
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
            last_updated_at,
            last_updated_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, now(), $14)
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
          user.uuid,
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send(profile);
  });

  app.post("/api/v1/form-425c", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;
    const reportingMonth = b.reporting_month.length === 7 ? `${b.reporting_month}-01` : b.reporting_month;
    const { prevMonthDate } = monthWindow(reportingMonth.slice(0, 7));

    const created = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      await ensureDefaultProfiles(client, b.operating_company_id, user.uuid);
      const prevRes = await client.query(
        `
          SELECT id, line_35_next_proj_receipts, line_36_next_proj_disbursements, line_37_next_proj_net_cash_flow
          FROM compliance.form_425c_reports
          WHERE operating_company_id = $1
            AND reporting_month = $2::date
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [b.operating_company_id, prevMonthDate]
      );
      const prev = prevRes.rows[0];
      const line32 = Number(prev?.line_35_next_proj_receipts ?? 0);
      const line33 = Number(prev?.line_36_next_proj_disbursements ?? 0);
      const line34 = line32 - line33;

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
          b.petition_date,
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
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/form-425c/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = patchSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const currentRes = await client.query(
        `
          SELECT *
          FROM compliance.form_425c_reports
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, b.operating_company_id]
      );
      const current = currentRes.rows[0];
      if (!current) return null;

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
      if ((incoming32 !== undefined || incoming33 !== undefined) && current.carry_forward_source_report_id) {
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

      const line32 = Number(incoming32 ?? current.line_32_proj_receipts ?? 0);
      const line33 = Number(incoming33 ?? current.line_33_proj_disbursements ?? 0);
      values.push(line32 - line33);
      updates.push(`line_34_proj_net_cash_flow = $${values.length}`);

      const line35 = Number(b.line_35_next_proj_receipts ?? current.line_35_next_proj_receipts ?? 0);
      const line36 = Number(b.line_36_next_proj_disbursements ?? current.line_36_next_proj_disbursements ?? 0);
      values.push(line35 - line36);
      updates.push(`line_37_next_proj_net_cash_flow = $${values.length}`);

      if (updates.length === 0) return current;
      const updateRes = await client.query(
        `
          UPDATE compliance.form_425c_reports
          SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        values
      );
      const report = updateRes.rows[0];
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
    }).catch((error: Error) => {
      if (error.message === "projection_override_reason_required_min_30_chars") {
        throw error;
      }
      throw error;
    });

    if (!updated) return reply.code(404).send({ error: "report_not_found" });
    return updated;
  });

  app.get("/api/v1/form-425c/banking-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = MONTH_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;
    const summary = await withCompanyScope(user.uuid, q.operating_company_id, async (client) =>
      computeBankingSummary(client, q.operating_company_id, q.month)
    );
    return summary;
  });

  app.post("/api/v1/form-425c/:id/import-banking", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = COMPANY_QUERY.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const reportRes = await client.query<{ reporting_month: string }>(
        `
          SELECT reporting_month::text
          FROM compliance.form_425c_reports
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, b.operating_company_id]
      );
      const report = reportRes.rows[0];
      if (!report) return null;
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
            AND operating_company_id = $2
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
      return res.rows[0];
    });
    if (!updated) return reply.code(404).send({ error: "report_not_found" });
    return updated;
  });

  app.post("/api/v1/form-425c/:id/generate-filing-pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = COMPANY_QUERY.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const payload = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
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
            AND operating_company_id = $2
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
    if (!payload) return reply.code(404).send({ error: "report_not_found" });
    return payload;
  });

  app.post("/api/v1/form-425c/:id/mark-filed", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = markFiledSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE compliance.form_425c_reports
          SET status = 'filed',
              filed_at = COALESCE($3::timestamptz, now()),
              filed_by_user_id = $4,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
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
    if (!updated) return reply.code(404).send({ error: "report_not_found_or_invalid_state" });
    return updated;
  });

  app.post("/api/v1/form-425c/:id/amend", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = COMPANY_QUERY.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const amended = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const srcRes = await client.query(
        `
          SELECT *
          FROM compliance.form_425c_reports
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, b.operating_company_id]
      );
      const src = srcRes.rows[0];
      if (!src) return null;
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
    if (!amended) return reply.code(404).send({ error: "report_not_found" });
    return reply.code(201).send(amended);
  });

  app.post("/api/v1/form-425c/:id/exhibit-a", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = exhibitSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    if (body.data.line_number < 1 || body.data.line_number > 9) return reply.code(400).send({ error: "line_number_must_be_1_to_9" });
    const b = body.data;

    const created = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO compliance.form_425c_exhibit_a_entries (report_id, line_number, explanation)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [params.data.id, b.line_number, b.explanation]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.form_425c.draft_saved",
        {
          resource_type: "compliance.form_425c_exhibit_a_entries",
          resource_id: res.rows[0]?.id,
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
  });

  app.post("/api/v1/form-425c/:id/exhibit-b", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = exhibitSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    if (body.data.line_number < 10 || body.data.line_number > 18) return reply.code(400).send({ error: "line_number_must_be_10_to_18" });
    const b = body.data;

    const created = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO compliance.form_425c_exhibit_b_entries (report_id, line_number, explanation)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [params.data.id, b.line_number, b.explanation]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.form_425c.draft_saved",
        {
          resource_type: "compliance.form_425c_exhibit_b_entries",
          resource_id: res.rows[0]?.id,
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
  });

  app.post("/api/v1/form-425c/:id/attachments/:line", async (req, reply) => {
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

    const updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const fileRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM docs.files
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [b.file_uuid, b.operating_company_id]
      );
      if (!fileRes.rows[0]) throw new Error("file_not_found");
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
            AND operating_company_id = $2
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
    if (!updated) return reply.code(404).send({ error: "report_not_found" });
    return updated;
  });
}
