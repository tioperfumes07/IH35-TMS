// BLOCK-17/24 — 1099-NEC/1042-S annual tax-document routes.
//
// Everything here is gated by the TAX_DOC_1099_ENABLED flag (default OFF — see migration
// 202607130100_block17_24_tax_document_engine.sql). When OFF every route returns 409. This
// engine NEVER e-files or transmits to the IRS — it generates/archives/previews only; Jorge
// transmits by hand every year (docs/specs/1099-and-tax-doc-BLOCK-17-DESIGN.md §6).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { putObjectBytes } from "../storage/r2-client.js";
import { aggregateBox1CompForTaxYear, loadTaxFormThreshold } from "./box1-aggregation.service.js";
import { renderForm1099NecPdf, FORM_1099_NEC_TEMPLATE_VERSION } from "./tax-document-pdf-renderer.js";

const FLAG_KEY = "TAX_DOC_1099_ENABLED";

type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[] }>;
};

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const taxYearQuery = companyQuery.extend({ tax_year: z.coerce.number().int().min(2020).max(2100) });
const idParams = z.object({ id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client as Queryable);
  });
}

async function flagGate(client: Queryable, companyId: string, userId: string, reply: FastifyReply): Promise<boolean> {
  const enabled = await isEnabled(client, FLAG_KEY, { operating_company_id: companyId, user_uuid: userId });
  if (!enabled) {
    reply.code(409).send({
      error: "feature_disabled",
      flag: FLAG_KEY,
      detail: "1099-NEC/1042-S generation is owner/CPA-gated and currently OFF for this company.",
    });
    return false;
  }
  return true;
}

export async function registerTaxDocumentRoutes(app: FastifyInstance) {
  // Read-only preview of the annual Box-1 aggregation — no writes, safe to check even while
  // the flag is being evaluated by the owner/CPA (still 409s if OFF, per the flag's own contract).
  app.get("/api/v1/tax-documents/1099-nec/box1-preview", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = taxYearQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await flagGate(client, query.data.operating_company_id, user.uuid, reply))) return null;
      const rows = await aggregateBox1CompForTaxYear(client, query.data.operating_company_id, query.data.tax_year);
      const threshold = await loadTaxFormThreshold(client, query.data.tax_year, "1099_nec");
      return { tax_year: query.data.tax_year, threshold, drivers: rows };
    });
    if (result === null) return; // flagGate already replied 409
    return result;
  });

  // Creates (or refreshes) the draft annual batch: one accounting.tax_document_batch row +
  // one accounting.tax_document + accounting.form_1099_nec DRAFT row per US-person driver whose
  // Box-1 comp meets/exceeds the year-keyed threshold. Never issues — issuance is a separate,
  // explicit action (kept apart from generation so a draft can be reviewed first).
  app.post("/api/v1/tax-documents/1099-nec/generate-batch", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = taxYearQuery.safeParse({ ...(req.query as object), ...(req.body as object) });
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await flagGate(client, body.data.operating_company_id, user.uuid, reply))) return null;

      const threshold = await loadTaxFormThreshold(client, body.data.tax_year, "1099_nec");
      if (!threshold) {
        reply.code(422).send({
          error: "no_threshold_for_tax_year",
          detail: `catalogs.tax_form_thresholds has no 1099_nec row for tax year ${body.data.tax_year} — add one before generating (never hardcode a threshold).`,
        });
        return null;
      }

      const box1Rows = await aggregateBox1CompForTaxYear(client, body.data.operating_company_id, body.data.tax_year);

      const companyRes = await client.query<{ legal_name: string; tax_id: string | null }>(
        `SELECT legal_name, tax_id FROM org.companies WHERE id = $1 LIMIT 1`,
        [body.data.operating_company_id]
      );
      const company = companyRes.rows[0];

      const batchRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.tax_document_batch
            (operating_company_id, tax_year, form_type, status, created_by_user_id)
          VALUES ($1, $2, '1099_nec', 'draft', $3)
          ON CONFLICT (operating_company_id, tax_year, form_type)
          DO UPDATE SET status = 'draft'
          RETURNING id
        `,
        [body.data.operating_company_id, body.data.tax_year, user.uuid]
      );
      const batchId = batchRes.rows[0]?.id;

      let payeeCount = 0;
      let totalCompCents = 0;
      const belowThreshold: Array<{ driver_id: string; box1_nonemployee_comp_cents: number }> = [];
      const noProfile: string[] = [];

      for (const row of box1Rows) {
        if (row.box1_nonemployee_comp_cents < threshold.reporting_threshold_cents) {
          belowThreshold.push({ driver_id: row.driver_id, box1_nonemployee_comp_cents: row.box1_nonemployee_comp_cents });
          continue;
        }

        const profileRes = await client.query<{ id: string; tax_status: string }>(
          `
            SELECT id, tax_status FROM catalogs.payee_tax_profile
            WHERE operating_company_id = $1::uuid AND payee_type = 'driver' AND payee_id = $2
              AND effective_tax_year = $3 AND voided_at IS NULL
            LIMIT 1
          `,
          [body.data.operating_company_id, row.driver_id, body.data.tax_year]
        );
        const profile = profileRes.rows[0];
        if (!profile || profile.tax_status !== "us_person") {
          noProfile.push(row.driver_id);
          continue;
        }

        // TAX-F6293 — the aggregated settlement rows are scoped by the selected company, but a
        // shared USMCA driver's canonical mdata.drivers row lives on a different home company. The
        // old home-company-only lookup returned 0 rows for such a driver, driver was undefined, and
        // the recipient_name write below silently fell back to the literal "Driver". Admit the
        // driver through home company OR an active canonical selected-company authorization, same
        // predicate already used for this exact class of shared-driver identity resolution
        // (late-arrivals.service.ts, pre-dispatch-validator.service.ts).
        const driverRes = await client.query<{ first_name: string; last_name: string }>(
          `
            SELECT d.first_name, d.last_name
            FROM mdata.drivers d
            WHERE d.id = $1
              AND (
                d.operating_company_id = $2::uuid
                OR EXISTS (
                  SELECT 1
                  FROM mdata.driver_company_authorizations tax_1099_dca
                  WHERE tax_1099_dca.driver_id = d.id
                    AND tax_1099_dca.company_id = $2::uuid
                    AND tax_1099_dca.is_authorized = true
                    AND tax_1099_dca.deactivated_at IS NULL
                )
              )
            LIMIT 1
          `,
          [row.driver_id, body.data.operating_company_id]
        );
        const driver = driverRes.rows[0];

        const docRes = await client.query<{ id: string }>(
          `
            INSERT INTO accounting.tax_document
              (operating_company_id, document_kind, tax_year, batch_id, subject_payee_id, status, created_by_user_id)
            VALUES ($1, 'form_1099_nec', $2, $3, $4, 'draft', $5)
            RETURNING id
          `,
          [body.data.operating_company_id, body.data.tax_year, batchId, profile.id, user.uuid]
        );
        const taxDocumentId = docRes.rows[0]?.id;

        await client.query(
          `
            INSERT INTO accounting.form_1099_nec (
              operating_company_id, tax_document_id, tax_year, payee_tax_profile_id,
              payer_legal_name, payer_tin, payer_address_snapshot,
              recipient_name, recipient_tin_masked, recipient_address_snapshot,
              box1_nonemployee_comp_cents, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, 'draft')
            ON CONFLICT (operating_company_id, payee_tax_profile_id, tax_year)
            DO UPDATE SET box1_nonemployee_comp_cents = EXCLUDED.box1_nonemployee_comp_cents, updated_at = now()
            WHERE accounting.form_1099_nec.status = 'draft'
          `,
          [
            body.data.operating_company_id,
            taxDocumentId,
            body.data.tax_year,
            profile.id,
            company?.legal_name ?? "IH35",
            company?.tax_id ?? "00-0000000",
            JSON.stringify({}),
            `${driver?.first_name ?? ""} ${driver?.last_name ?? ""}`.trim() || "Driver",
            "***" /* masked until issued */,
            JSON.stringify({}),
            row.box1_nonemployee_comp_cents,
          ]
        );

        payeeCount += 1;
        totalCompCents += row.box1_nonemployee_comp_cents;
      }

      await client.query(
        `UPDATE accounting.tax_document_batch SET payee_count = $2, total_comp_cents = $3 WHERE id = $1`,
        [batchId, payeeCount, totalCompCents]
      );

      await appendCrudAudit(client, user.uuid, "tax_documents.1099_nec.batch_generated", {
        resource_type: "accounting.tax_document_batch",
        resource_id: batchId,
        operating_company_id: body.data.operating_company_id,
        tax_year: body.data.tax_year,
        payee_count: payeeCount,
        total_comp_cents: totalCompCents,
        below_threshold_count: belowThreshold.length,
        missing_payee_profile_count: noProfile.length,
      });

      return {
        batch_id: batchId,
        payee_count: payeeCount,
        total_comp_cents: totalCompCents,
        below_threshold: belowThreshold,
        missing_payee_tax_profile_driver_ids: noProfile,
      };
    });

    if (result === null) return;
    return reply.code(201).send(result);
  });

  // Renders the PDF for one draft form_1099_nec, archives it to R2/docs.files (never overwrites
  // an already-issued document — immutability is also DB-trigger-enforced, this is belt+suspenders).
  app.post("/api/v1/tax-documents/1099-nec/:id/render-pdf", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    const query = companyQuery.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await flagGate(client, query.data.operating_company_id, user.uuid, reply))) return null;

      const formRes = await client.query<Record<string, unknown>>(
        `
          SELECT f.*, td.status AS tax_document_status
          FROM accounting.form_1099_nec f
          JOIN accounting.tax_document td ON td.id = f.tax_document_id
          WHERE f.id = $1 AND f.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const form = formRes.rows[0];
      if (!form) {
        reply.code(404).send({ error: "not_found" });
        return null;
      }

      const pdf = await renderForm1099NecPdf({
        taxYear: Number(form.tax_year),
        payerLegalName: String(form.payer_legal_name),
        payerTin: String(form.payer_tin),
        payerAddress: JSON.stringify(form.payer_address_snapshot ?? {}),
        recipientName: String(form.recipient_name),
        recipientTinMasked: String(form.recipient_tin_masked),
        recipientAddress: JSON.stringify(form.recipient_address_snapshot ?? {}),
        box1NonemployeeCompCents: Number(form.box1_nonemployee_comp_cents),
        box4FederalWithheldCents: Number(form.box4_federal_income_tax_withheld_cents ?? 0),
        isCorrected: Boolean(form.is_corrected),
      });

      const sha256 = crypto.createHash("sha256").update(pdf.pdfBuffer).digest("hex");
      const fileUuid = crypto.randomUUID();
      const r2Key = `org/${query.data.operating_company_id}/tax-documents/${form.tax_year}/form_1099_nec/${fileUuid}.pdf`;
      await putObjectBytes(r2Key, pdf.pdfBuffer, "application/pdf");

      const fileInsert = await client.query<{ id: string }>(
        `
          INSERT INTO docs.files (
            operating_company_id, original_filename, mime_type, size_bytes, sha256_hash,
            r2_key, upload_completed_at, description, uploader_user_id
          )
          VALUES ($1, $2, 'application/pdf', $3, $4, $5, now(), $6, $7)
          RETURNING id
        `,
        [
          query.data.operating_company_id,
          `1099-nec-${form.tax_year}-${String(form.recipient_name).replace(/\s+/g, "-")}.pdf`,
          pdf.pdfBuffer.length,
          sha256,
          r2Key,
          `Generated Form 1099-NEC — tax year ${form.tax_year}`,
          user.uuid,
        ]
      );
      const fileId = fileInsert.rows[0]?.id;

      await client.query(
        `
          UPDATE accounting.tax_document
          SET file_id = $2, rendered_at = now(), render_template_version = $3
          WHERE id = $1
        `,
        [form.tax_document_id, fileId, FORM_1099_NEC_TEMPLATE_VERSION]
      );

      await client.query(
        `
          INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
          VALUES ($1, 'tax_document', $2, $3)
          ON CONFLICT (file_id, entity_type, entity_id) DO NOTHING
        `,
        [fileId, form.tax_document_id, user.uuid]
      );

      await appendCrudAudit(client, user.uuid, "tax_documents.1099_nec.pdf_rendered", {
        resource_type: "accounting.form_1099_nec",
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
        file_id: fileId,
      });

      return { tax_document_id: form.tax_document_id, file_id: fileId, r2_key: r2Key };
    });

    if (result === null) return;
    return reply.code(201).send(result);
  });
}
