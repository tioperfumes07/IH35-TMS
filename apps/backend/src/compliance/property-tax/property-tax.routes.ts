import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import {
  addRenditionLine,
  createAppraisalDistrict,
  createRendition,
  getRendition,
  listAppraisalDistricts,
  listCandidateAssets,
  listRenditions,
  updateRendition,
} from "./property-tax.service.js";
import { renderPropertyTaxRenditionPdfBody } from "./property-tax-pdf-renderer.service.js";
import { wrapPdfDocument } from "../../render/pdf-template.js";

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const renditionListQuery = companyQuery.extend({ unit_id: z.string().uuid().optional() });

const createRenditionBody = z.object({
  operating_company_id: z.string().uuid(),
  tax_year: z.number().int().min(2000).max(2100),
  appraisal_district_id: z.string().uuid(),
  value_basis: z.enum(["historical_cost", "market_value", "depreciated_cost"]).optional(),
  cad_account_number: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const updateRenditionBody = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["draft", "filed", "appealed", "settled"]).optional(),
  value_basis: z.enum(["historical_cost", "market_value", "depreciated_cost"]).optional(),
  extension_requested: z.boolean().optional(),
  extended_due_date: z.string().nullable().optional(),
  cad_account_number: z.string().trim().max(120).nullable().optional(),
  assessed_tax_cents: z.number().int().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const addLineBody = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable().optional(),
  equipment_id: z.string().uuid().nullable().optional(),
  fixed_asset_id: z.string().uuid().nullable().optional(),
  asset_description: z.string().trim().min(1).max(300),
  asset_category: z.enum(["tractor", "trailer", "equipment", "office", "other"]).nullable().optional(),
  acquisition_date: z.string().nullable().optional(),
  acquisition_cost_cents: z.number().int().nullable().optional(),
  rendered_value_cents: z.number().int().min(0).optional(),
});

const createDistrictBody = z.object({
  operating_company_id: z.string().uuid(),
  state: z.string().trim().max(4).optional(),
  county: z.string().trim().min(1).max(120),
  cad_name: z.string().trim().min(1).max(200),
});

// Business-Property Allocation — TX property-tax rendition (filing side). Entity-scoped (RLS via
// app.operating_company_id) + membership-gated. Read is open to any company member; writes are gated at
// the DB (RLS) to Owner/Administrator/Accountant/Manager/Safety.
export async function registerPropertyTaxRoutes(app: FastifyInstance) {
  // List appraisal districts (reference).
  app.get("/api/v1/compliance/property-tax/appraisal-districts", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const districts = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [q.data.operating_company_id]);
      return listAppraisalDistricts(client);
    });
    return reply.send({ districts });
  });

  // Inline "+ Add new appraisal district".
  app.post("/api/v1/compliance/property-tax/appraisal-districts", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = createDistrictBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const district = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [body.data.operating_company_id]);
      return createAppraisalDistrict(client, user.uuid, { state: body.data.state, county: body.data.county, cad_name: body.data.cad_name });
    });
    return reply.code(201).send({ district });
  });

  // Candidate taxable assets (owned fleet) for the rendering entity.
  app.get("/api/v1/compliance/property-tax/candidate-assets", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const assets = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [q.data.operating_company_id]);
      return listCandidateAssets(client, q.data.operating_company_id);
    });
    return reply.send({ assets });
  });

  // List renditions for the entity.
  app.get("/api/v1/compliance/property-tax/renditions", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const q = renditionListQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const renditions = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [q.data.operating_company_id]);
      return listRenditions(client, q.data.operating_company_id, q.data.unit_id);
    });
    return reply.send({ renditions });
  });

  // One rendition + its basis lines.
  app.get("/api/v1/compliance/property-tax/renditions/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const { id } = req.params as { id: string };
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [q.data.operating_company_id]);
      return getRendition(client, q.data.operating_company_id, id);
    });
    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.send(result);
  });

  // BUSINESS-PROPERTY-ALLOCATION-PRINT: no product surface ever offered a printable form for a TX
  // BPP rendition (grepped the entire frontend page for Print/pdf/PDF/Export — zero hits), so the
  // only way to "print" this compliance filing was the browser printing the SPA chrome, which the
  // COMPLICATED-SCENARIO-BATTERY law names as a FINDING outright. Letter HTML, same
  // wrapPdfDocument/PDF_BASE_STYLES architecture as invoices/bills/work orders.
  app.get(
    "/api/v1/compliance/property-tax/renditions/:id.html",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const q = companyQuery.safeParse(req.query ?? {});
      if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
      const { id } = req.params as { id: string };
      await assertCompanyMembership(user.uuid, q.data.operating_company_id);
      const payload = await withCurrentUser(user.uuid, async (client) => {
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [q.data.operating_company_id]);
        const result = await getRendition(client, q.data.operating_company_id, id);
        if (!result) return null;
        const { rendition, lines } = result;
        const companyRes = await client.query<{ legal_name: string | null; short_name: string | null; tax_id: string | null }>(
          `SELECT legal_name, short_name, tax_id FROM org.companies WHERE id = $1 LIMIT 1`,
          [q.data.operating_company_id]
        );
        const company = companyRes.rows[0] ?? {};
        const body = renderPropertyTaxRenditionPdfBody({
          companyLegalName: String(company.legal_name ?? company.short_name ?? "Carrier"),
          companyMcDotEinLine: company.tax_id ? `EIN ${String(company.tax_id)}` : "Motor carrier identifiers on file",
          taxYear: rendition.tax_year,
          cadName: rendition.cad_name,
          county: rendition.county,
          status: rendition.status,
          valueBasis: rendition.value_basis,
          dueDate: rendition.due_date,
          extensionRequested: rendition.extension_requested,
          extendedDueDate: rendition.extended_due_date,
          cadAccountNumber: rendition.cad_account_number,
          totalRenderedValueCents: rendition.total_rendered_value_cents,
          assessedTaxCents: rendition.assessed_tax_cents,
          filedAt: rendition.filed_at,
          notes: rendition.notes,
          lines: lines.map((l) => ({
            assetDescription: l.asset_description,
            assetCategory: l.asset_category,
            acquisitionDate: l.acquisition_date,
            acquisitionCostCents: l.acquisition_cost_cents,
            renderedValueCents: l.rendered_value_cents,
          })),
        });
        return { title: `${rendition.tax_year} Rendition — ${rendition.county}`, body };
      });
      if (payload === null) return reply.code(404).type("text/plain").send("rendition_not_found");
      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "no-store");
      return reply.send(wrapPdfDocument(payload));
    }
  );

  // Create a draft rendition.
  app.post("/api/v1/compliance/property-tax/renditions", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = createRenditionBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const rendition = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [body.data.operating_company_id]);
      return createRendition(client, body.data.operating_company_id, user.uuid, {
        tax_year: body.data.tax_year,
        appraisal_district_id: body.data.appraisal_district_id,
        value_basis: body.data.value_basis,
        cad_account_number: body.data.cad_account_number,
        notes: body.data.notes,
      });
    });
    return reply.code(201).send({ rendition });
  });

  // Update a rendition (status transition, extension, assessed tax, notes).
  app.patch("/api/v1/compliance/property-tax/renditions/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = updateRenditionBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const { id } = req.params as { id: string };
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const rendition = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [body.data.operating_company_id]);
      return updateRendition(client, body.data.operating_company_id, user.uuid, id, {
        status: body.data.status,
        value_basis: body.data.value_basis,
        extension_requested: body.data.extension_requested,
        extended_due_date: body.data.extended_due_date,
        cad_account_number: body.data.cad_account_number,
        assessed_tax_cents: body.data.assessed_tax_cents,
        notes: body.data.notes,
      });
    });
    if (!rendition) return reply.code(404).send({ error: "not_found" });
    return reply.send({ rendition });
  });

  // Add a taxable-asset basis line.
  app.post("/api/v1/compliance/property-tax/renditions/:id/lines", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = addLineBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const { id } = req.params as { id: string };
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const line = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [body.data.operating_company_id]);
      return addRenditionLine(client, body.data.operating_company_id, user.uuid, id, {
        unit_id: body.data.unit_id,
        equipment_id: body.data.equipment_id,
        fixed_asset_id: body.data.fixed_asset_id,
        asset_description: body.data.asset_description,
        asset_category: body.data.asset_category,
        acquisition_date: body.data.acquisition_date,
        acquisition_cost_cents: body.data.acquisition_cost_cents,
        rendered_value_cents: body.data.rendered_value_cents,
      });
    });
    return reply.code(201).send({ line });
  });
}
