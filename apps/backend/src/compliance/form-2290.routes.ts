import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  computeForm2290Vehicles,
  renderForm2290Pdf,
  upcomingForm2290Deadline,
  type Form2290VehicleInput,
} from "./form-2290-generator.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });
const generateSchema = companyQuery.extend({
  tax_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const markSubmittedSchema = companyQuery.extend({
  irs_efile_acceptance_id: z.string().trim().min(1).optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client as Queryable);
  });
}

function taxPeriodEnd(start: string) {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCMonth(5);
  d.setUTCDate(30);
  return d.toISOString().slice(0, 10);
}

async function loadActiveTractors(client: Queryable, companyId: string): Promise<Form2290VehicleInput[]> {
  const res = await client.query<{
    id: string;
    unit_number: string;
    vin: string;
    irp_registered_weight_lbs: number | null;
    acquired_date: string | null;
  }>(
    `
      SELECT id, unit_number, vin, irp_registered_weight_lbs, acquired_date
      FROM mdata.units
      WHERE deactivated_at IS NULL
        AND status = 'InService'
        AND vin IS NOT NULL
        AND (
          operating_company_id = $1
          OR owner_company_id = $1
          OR currently_leased_to_company_id = $1
        )
      ORDER BY unit_number
    `,
    [companyId]
  );
  return res.rows.map((row) => ({
    unitId: row.id,
    unitNumber: row.unit_number,
    vin: row.vin,
    grossWeightLbs: row.irp_registered_weight_lbs ?? 80_000,
    firstUsedMonth: row.acquired_date,
    suspensionClaimed: false,
  }));
}

export async function registerForm2290Routes(app: FastifyInstance) {
  app.get("/api/v1/compliance/form-2290/upcoming-deadline", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuery.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error" });

    const { deadline, daysRemaining } = upcomingForm2290Deadline();
    const draft = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id, filing_status, tax_period_start, tax_period_end, total_tax_due
          FROM compliance.form_2290_filings
          WHERE operating_company_id = $1
            AND tax_period_start = (
              CASE WHEN extract(month from current_date) >= 7
                THEN make_date(extract(year from current_date)::int, 7, 1)
                ELSE make_date(extract(year from current_date)::int - 1, 7, 1)
              END
            )
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [company.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    return { deadline, days_remaining: daysRemaining, current_draft: draft };
  });

  app.get("/api/v1/compliance/form-2290", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuery.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error" });

    const filings = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM compliance.form_2290_filings
          WHERE operating_company_id = $1
          ORDER BY tax_period_start DESC, created_at DESC
          LIMIT 100
        `,
        [company.data.operating_company_id]
      );
      return res.rows;
    });
    return { filings };
  });

  app.post("/api/v1/compliance/form-2290/generate-draft", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = generateSchema.safeParse({ ...(req.query as object), ...(req.body as object) });
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const periodEnd = taxPeriodEnd(body.data.tax_period_start);
    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      // EVIDENCE GUARD: never regenerate over an already-filed period. The upsert below resets
      // filing_status to 'draft' and DELETEs all filing vehicles — if the existing filing was
      // submitted/accepted, that would silently overwrite IRS-submitted evidence. Only a draft (or an
      // absent filing) may be (re)generated; anything else is refused (409).
      const existingRes = await client.query<{ filing_status: string }>(
        `
          SELECT filing_status
          FROM compliance.form_2290_filings
          WHERE operating_company_id = $1 AND tax_period_start = $2 AND tax_period_end = $3
          LIMIT 1
        `,
        [body.data.operating_company_id, body.data.tax_period_start, periodEnd]
      );
      const existingStatus = existingRes.rows[0]?.filing_status;
      if (existingStatus && existingStatus !== "draft") {
        return { blocked_status: existingStatus } as const;
      }

      const tractors = await loadActiveTractors(client, body.data.operating_company_id);
      const computed = computeForm2290Vehicles(tractors, body.data.tax_period_start);
      const totalTaxDue = computed.reduce((sum, row) => sum + row.taxDue, 0);

      const companyRes = await client.query<{ legal_name: string; tax_id: string | null }>(
        `SELECT legal_name, tax_id FROM org.companies WHERE id = $1 LIMIT 1`,
        [body.data.operating_company_id]
      );
      const companyRow = companyRes.rows[0];
      const pdf = await renderForm2290Pdf({
        ein: companyRow?.tax_id ?? "00-0000000",
        companyName: companyRow?.legal_name ?? "Carrier",
        taxPeriodStart: body.data.tax_period_start,
        taxPeriodEnd: periodEnd,
        vehicles: computed,
        totalTaxDue,
      });

      const filingRes = await client.query<{ id: string }>(
        `
          INSERT INTO compliance.form_2290_filings (
            operating_company_id, tax_period_start, tax_period_end,
            filing_status, total_tax_due, created_by_user_id
          )
          VALUES ($1, $2, $3, 'draft', $4, $5)
          ON CONFLICT (operating_company_id, tax_period_start, tax_period_end)
          DO UPDATE SET
            total_tax_due = EXCLUDED.total_tax_due,
            filing_status = 'draft',
            updated_at = now()
          RETURNING id
        `,
        [body.data.operating_company_id, body.data.tax_period_start, periodEnd, totalTaxDue, user.uuid]
      );
      const filingId = filingRes.rows[0]?.id;
      if (!filingId) throw new Error("filing_insert_failed");

      await client.query(`DELETE FROM compliance.form_2290_filing_vehicles WHERE filing_id = $1`, [filingId]);
      for (const vehicle of computed) {
        await client.query(
          `
            INSERT INTO compliance.form_2290_filing_vehicles (
              filing_id, operating_company_id, vehicle_id, vin,
              gross_weight_lbs, gross_weight_category, tax_due,
              suspension_claimed, first_used_month
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            filingId,
            body.data.operating_company_id,
            vehicle.unitId,
            vehicle.vin,
            vehicle.grossWeightLbs,
            vehicle.grossWeightCategory,
            vehicle.taxDue,
            vehicle.suspensionClaimed,
            vehicle.firstUsedMonth,
          ]
        );
      }

      await appendCrudAudit(client, user.uuid, "compliance.form_2290.draft_generated", {
        resource_type: "compliance.form_2290_filings",
        resource_id: filingId,
        operating_company_id: body.data.operating_company_id,
        vehicle_count: computed.length,
        total_tax_due: totalTaxDue,
      });

      return { filing_id: filingId, total_tax_due: totalTaxDue, vehicle_count: computed.length, pdf_base64: pdf.pdfBuffer.toString("base64") };
    });

    if ("blocked_status" in result) {
      return reply.code(409).send({
        error: "filing_already_submitted",
        filing_status: result.blocked_status,
        detail:
          "A Form 2290 for this tax period has already been submitted/accepted. Regenerating would overwrite IRS-filed evidence; it is refused. Void or amend the existing filing instead.",
      });
    }

    return reply.code(201).send(result);
  });

  app.get("/api/v1/compliance/form-2290/draft/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    const company = companyQuery.safeParse(req.query ?? {});
    if (!params.success || !company.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const filingRes = await client.query(
        `SELECT * FROM compliance.form_2290_filings WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, company.data.operating_company_id]
      );
      const filing = filingRes.rows[0];
      if (!filing) return null;
      const vehiclesRes = await client.query(
        `SELECT * FROM compliance.form_2290_filing_vehicles WHERE filing_id = $1 ORDER BY vin`,
        [params.data.id]
      );
      const companyRes = await client.query<{ legal_name: string; tax_id: string | null }>(
        `SELECT legal_name, tax_id FROM org.companies WHERE id = $1 LIMIT 1`,
        [company.data.operating_company_id]
      );
      const companyRow = companyRes.rows[0];
      const computed = vehiclesRes.rows.map((row) => ({
        unitId: String(row.vehicle_id),
        unitNumber: String(row.vin).slice(-6),
        vin: String(row.vin),
        grossWeightLbs: Number(row.gross_weight_lbs),
        firstUsedMonth: row.first_used_month ? String(row.first_used_month) : null,
        suspensionClaimed: Boolean(row.suspension_claimed),
        grossWeightCategory: String(row.gross_weight_category),
        annualTax: Number(row.tax_due),
        taxDue: Number(row.tax_due),
      }));
      const pdf = await renderForm2290Pdf({
        ein: companyRow?.tax_id ?? "00-0000000",
        companyName: companyRow?.legal_name ?? "Carrier",
        taxPeriodStart: String(filing.tax_period_start),
        taxPeriodEnd: String(filing.tax_period_end),
        vehicles: computed,
        totalTaxDue: Number(filing.total_tax_due),
      });
      return { filing, vehicles: vehiclesRes.rows, pdf_base64: pdf.pdfBuffer.toString("base64") };
    });

    if (!payload) return reply.code(404).send({ error: "not_found" });
    reply.header("Content-Type", "application/json");
    return payload;
  });

  app.post("/api/v1/compliance/form-2290/:id/mark-submitted", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    const body = markSubmittedSchema.safeParse({ ...(req.query as object), ...(req.body as object) });
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE compliance.form_2290_filings
          SET filing_status = 'submitted',
              filed_at = now(),
              irs_efile_acceptance_id = COALESCE($3, irs_efile_acceptance_id),
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, body.data.operating_company_id, body.data.irs_efile_acceptance_id ?? null]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { filing: updated };
  });
}
