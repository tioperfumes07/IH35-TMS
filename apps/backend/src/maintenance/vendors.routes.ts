/** B29: canonical maintenance vendors — catalogs.maintenance_vendors (ARCHIVE-not-DELETE). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const VENDOR_CODE_REGEX = /^[A-Z][A-Z0-9-]+$/;

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().optional(),
  include_archived: z.coerce.boolean().optional().default(false),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  code: z.string().trim().regex(VENDOR_CODE_REGEX).optional(),
  display_name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(500).optional(),
  type: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(120).optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(300).optional(),
  payment_terms: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const patchSchema = createSchema
  .omit({ operating_company_id: true })
  .partial()
  .extend({ operating_company_id: z.string().uuid() })
  .refine((v) => Object.keys(v).filter((k) => k !== "operating_company_id").length > 0, {
    message: "at least one field is required",
  });

const archiveSchema = z.object({
  operating_company_id: z.string().uuid(),
  archive_reason: z.string().trim().min(3).max(240).optional(),
});

type CsvVendorRow = {
  code: string;
  display_name: string;
  description: string | null;
  type: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.replace(/^\ufeff/, "").trim());
}

function nameToVendorCode(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return "VENDOR";
  return VENDOR_CODE_REGEX.test(slug) ? slug : `V-${slug.replace(/^[^A-Z]+/, "")}`;
}

function buildVendorMetadata(input: {
  type?: string;
  contact?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  payment_terms?: string;
  notes?: string;
}) {
  const email = input.contact_email ?? (input.contact?.includes("@") ? input.contact : undefined);
  const phone = input.contact_phone ?? (input.contact && !input.contact.includes("@") ? input.contact : undefined);
  return {
    ...(input.type ? { type: input.type } : {}),
    ...(email ? { contact_email: email } : {}),
    ...(phone ? { contact_phone: phone } : {}),
    ...(input.address ? { address: input.address } : {}),
    ...(input.payment_terms ? { payment_terms: input.payment_terms } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

function mapVendorRow(row: Record<string, unknown>) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    code: row.code,
    display_name: row.display_name,
    name: row.display_name,
    description: row.description ?? null,
    type: metadata.type ?? null,
    contact_email: metadata.contact_email ?? null,
    contact_phone: metadata.contact_phone ?? null,
    address: metadata.address ?? null,
    payment_terms: metadata.payment_terms ?? null,
    notes: metadata.notes ?? null,
    is_active: row.is_active,
    active: row.is_active,
    archived_at: metadata.archived_at ?? null,
    archive_reason: metadata.archive_reason ?? null,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseVendorsCsv(text: string): CsvVendorRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV requires header and at least one row");
  const headers = parseCsvLine(lines[0]);
  for (const key of ["display_name"]) {
    if (!headers.includes(key)) throw new Error(`CSV missing required column: ${key}`);
  }
  return lines.slice(1).map((line, index) => {
    const row = parseCsvLine(line);
    const get = (key: string) => row[headers.indexOf(key)] ?? "";
    const displayName = get("display_name");
    if (!displayName) throw new Error(`Row ${index + 2}: display_name is required`);
    const codeRaw = get("code");
    const code = codeRaw ? codeRaw.toUpperCase() : nameToVendorCode(displayName);
    if (!VENDOR_CODE_REGEX.test(code)) throw new Error(`Row ${index + 2}: invalid code "${code}"`);
    return {
      code,
      display_name: displayName,
      description: get("description") || null,
      type: get("type") || null,
      contact_email: get("contact_email") || null,
      contact_phone: get("contact_phone") || null,
      address: get("address") || null,
      payment_terms: get("payment_terms") || null,
      notes: get("notes") || null,
    };
  });
}

function isVendorsCsvImportEnabled(): boolean {
  const flag = (process.env.MAINT_VENDORS_CSV_IMPORT_ENABLED ?? "").trim().toLowerCase();
  const explicitlyEnabled = flag === "1" || flag === "true" || flag === "yes";
  return process.env.NODE_ENV === "production" ? explicitlyEnabled : flag !== "0" && flag !== "false";
}

async function withCompany<T>(
  userId: string,
  companyId: string,
  fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

async function fetchVendorDetail(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  companyId: string,
  vendorId: string
) {
  const res = await client.query(
    `
      SELECT id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
      FROM catalogs.maintenance_vendors
      WHERE id = $1 AND operating_company_id = $2
      LIMIT 1
    `,
    [vendorId, companyId]
  );
  if (!res.rows[0]) return null;
  const vendor = mapVendorRow(res.rows[0]);
  const metadata = (res.rows[0].metadata ?? {}) as Record<string, unknown>;
  const mdataVendorId = typeof metadata.mdata_vendor_id === "string" ? metadata.mdata_vendor_id : null;
  const qboVendorId = typeof metadata.qbo_vendor_id === "string" ? metadata.qbo_vendor_id : null;

  const woRes = await client.query(
    `
      SELECT
        wo.id::text,
        wo.display_id,
        wo.status,
        wo.wo_type,
        wo.opened_at::text,
        wo.closed_at::text,
        wo.external_vendor_invoice_number,
        wo.external_vendor_invoice_amount,
        wo.repair_location
      FROM maintenance.work_orders wo
      WHERE wo.operating_company_id = $1
        AND (
          ($2::uuid IS NOT NULL AND wo.external_vendor_id = $2::uuid)
          OR ($3::uuid IS NOT NULL AND wo.vendor_id = $3::uuid)
          OR wo.repair_location ILIKE '%' || $4 || '%'
        )
      ORDER BY wo.opened_at DESC NULLS LAST, wo.created_at DESC
      LIMIT 100
    `,
    [companyId, mdataVendorId, qboVendorId, vendor.display_name]
  );

  const invoiceRes = await client.query(
    `
      SELECT
        wo.id::text AS work_order_id,
        wo.display_id,
        wo.external_vendor_invoice_number AS invoice_number,
        wo.external_vendor_invoice_amount AS invoice_amount,
        wo.closed_at::text AS invoice_date,
        wo.status
      FROM maintenance.work_orders wo
      WHERE wo.operating_company_id = $1
        AND NULLIF(trim(COALESCE(wo.external_vendor_invoice_number, '')), '') IS NOT NULL
        AND (
          ($2::uuid IS NOT NULL AND wo.external_vendor_id = $2::uuid)
          OR ($3::uuid IS NOT NULL AND wo.vendor_id = $3::uuid)
          OR wo.repair_location ILIKE '%' || $4 || '%'
        )
      ORDER BY wo.closed_at DESC NULLS LAST, wo.created_at DESC
      LIMIT 100
    `,
    [companyId, mdataVendorId, qboVendorId, vendor.display_name]
  );

  return {
    vendor,
    wo_history: woRes.rows,
    invoice_history: invoiceRes.rows,
  };
}

export async function registerMaintenanceVendorsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/vendors", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      const filters = ["operating_company_id = $1"];
      if (!parsed.data.include_archived) filters.push("is_active = true");
      if (parsed.data.search) {
        values.push(`%${parsed.data.search}%`);
        const idx = values.length;
        filters.push(`(code ILIKE $${idx} OR display_name ILIKE $${idx} OR COALESCE(description, '') ILIKE $${idx})`);
      }
      const result = await client.query(
        `
          SELECT id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
          FROM catalogs.maintenance_vendors
          WHERE ${filters.join(" AND ")}
          ORDER BY sort_order ASC, display_name ASC
        `,
        values
      );
      return result.rows.map((row) => mapVendorRow(row));
    });
    return { rows, csv_import_enabled: isVendorsCsvImportEnabled() };
  });

  app.get("/api/v1/maintenance/vendors/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = querySchema.pick({ operating_company_id: true }).safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const detail = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      fetchVendorDetail(client, parsed.data.operating_company_id, params.data.id)
    );
    if (!detail) return reply.code(404).send({ error: "maintenance_vendor_not_found" });
    return detail;
  });

  app.post("/api/v1/maintenance/vendors", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const code = body.code ?? nameToVendorCode(body.display_name);
    if (!VENDOR_CODE_REGEX.test(code)) {
      return reply.code(400).send({ error: "validation_error", message: "invalid vendor code" });
    }
    const metadata = buildVendorMetadata(body);
    const vendor = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO catalogs.maintenance_vendors (
            operating_company_id, code, display_name, description, metadata, is_active, sort_order
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, true, 50)
          RETURNING id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
        `,
        [body.operating_company_id, code, body.display_name, body.description ?? null, JSON.stringify(metadata)]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.created", {
        resource_id: res.rows[0]?.id,
        operating_company_id: body.operating_company_id,
        code,
      });
      return mapVendorRow(res.rows[0]);
    });
    return reply.code(201).send(vendor);
  });

  app.patch("/api/v1/maintenance/vendors/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const updated = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existing = await client.query(
        `SELECT id, code, display_name, description, metadata, is_active FROM catalogs.maintenance_vendors WHERE id = $1 AND operating_company_id = $2`,
        [params.data.id, body.operating_company_id]
      );
      if (!existing.rows[0]) return null;
      const prior = existing.rows[0];
      const priorMetadata = (prior.metadata ?? {}) as Record<string, unknown>;
      const nextMetadata = {
        ...priorMetadata,
        ...buildVendorMetadata(body),
      };
      const res = await client.query(
        `
          UPDATE catalogs.maintenance_vendors
          SET
            code = COALESCE($3, code),
            display_name = COALESCE($4, display_name),
            description = COALESCE($5, description),
            metadata = $6::jsonb,
            updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
        `,
        [
          params.data.id,
          body.operating_company_id,
          body.code ?? null,
          body.display_name ?? null,
          body.description ?? null,
          JSON.stringify(nextMetadata),
        ]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.updated", {
        resource_id: params.data.id,
        operating_company_id: body.operating_company_id,
        changes: buildPatchChanges(body as Record<string, unknown>, prior, res.rows[0]),
      });
      return mapVendorRow(res.rows[0]);
    });
    if (!updated) return reply.code(404).send({ error: "maintenance_vendor_not_found" });
    return updated;
  });

  app.patch("/api/v1/maintenance/vendors/:id/archive", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = archiveSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existing = await client.query(
        `SELECT id, metadata FROM catalogs.maintenance_vendors WHERE id = $1 AND operating_company_id = $2`,
        [params.data.id, body.operating_company_id]
      );
      if (!existing.rows[0]) return null;
      const metadata = {
        ...((existing.rows[0].metadata ?? {}) as Record<string, unknown>),
        archived_at: new Date().toISOString(),
        archive_reason: body.archive_reason ?? "Archived from maintenance vendors",
      };
      await client.query(
        `
          UPDATE catalogs.maintenance_vendors
          SET is_active = false, metadata = $3::jsonb, updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
        `,
        [params.data.id, body.operating_company_id, JSON.stringify(metadata)]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.archived", {
        resource_id: params.data.id,
        operating_company_id: body.operating_company_id,
      });
      return { ok: true };
    });
    if (!result) return reply.code(404).send({ error: "maintenance_vendor_not_found" });
    return result;
  });

  /** @deprecated Sunset 2026-09 — use /archive; ARCHIVE-not-DELETE only. */
  app.patch("/api/v1/maintenance/vendors/:id/void", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = archiveSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existing = await client.query(
        `SELECT id, metadata FROM catalogs.maintenance_vendors WHERE id = $1 AND operating_company_id = $2`,
        [params.data.id, body.operating_company_id]
      );
      if (!existing.rows[0]) return null;
      const metadata = {
        ...((existing.rows[0].metadata ?? {}) as Record<string, unknown>),
        archived_at: new Date().toISOString(),
        archive_reason: body.archive_reason ?? "Voided via legacy endpoint",
      };
      await client.query(
        `
          UPDATE catalogs.maintenance_vendors
          SET is_active = false, metadata = $3::jsonb, updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
        `,
        [params.data.id, body.operating_company_id, JSON.stringify(metadata)]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.archived", {
        resource_id: params.data.id,
        operating_company_id: body.operating_company_id,
        legacy_void: true,
      });
      return { ok: true };
    });
    if (!result) return reply.code(404).send({ error: "maintenance_vendor_not_found" });
    return result;
  });

  app.post("/api/v1/maintenance/vendors/import", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isVendorsCsvImportEnabled()) return reply.code(403).send({ error: "csv_import_disabled" });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    let csvText = "";
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        csvText = (await part.toBuffer()).toString("utf8");
        break;
      }
    }
    if (!csvText.trim()) return reply.code(400).send({ error: "file_required" });
    let parsedRows: CsvVendorRow[];
    try {
      parsedRows = parseVendorsCsv(csvText);
    } catch (error) {
      return reply.code(400).send({ error: "csv_parse_error", message: error instanceof Error ? error.message : "invalid csv" });
    }
    const result = await withCompany(user.uuid, companyId, async (client) => {
      let inserted = 0;
      const errors: Array<{ row: number; message: string }> = [];
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        try {
          await client.query(
            `
              INSERT INTO catalogs.maintenance_vendors (
                operating_company_id, code, display_name, description, metadata, is_active, sort_order
              )
              VALUES ($1, $2, $3, $4, $5::jsonb, true, 50)
              ON CONFLICT (operating_company_id, code) DO UPDATE
              SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                metadata = EXCLUDED.metadata,
                updated_at = now()
            `,
            [
              companyId,
              row.code,
              row.display_name,
              row.description,
              JSON.stringify(
                buildVendorMetadata({
                  type: row.type ?? undefined,
                  contact_email: row.contact_email ?? undefined,
                  contact_phone: row.contact_phone ?? undefined,
                  address: row.address ?? undefined,
                  payment_terms: row.payment_terms ?? undefined,
                  notes: row.notes ?? undefined,
                })
              ),
            ]
          );
          inserted += 1;
        } catch (error) {
          errors.push({ row: i + 2, message: error instanceof Error ? error.message : "insert failed" });
        }
      }
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.imported", {
        operating_company_id: companyId,
        inserted_rows: inserted,
        invalid_rows: errors.length,
      });
      return { inserted_rows: inserted, invalid_rows: errors.length, errors };
    });
    return result;
  });

  app.get("/api/v1/maintenance/vendors/import-template", async (_req, reply) => {
    const csv =
      "code,display_name,description,type,contact_email,contact_phone,address,payment_terms,notes\n" +
      "GOODYEAR-COMMERCIAL,Goodyear Commercial,Preferred tire vendor,Tire,rep@goodyear.com,555-0100,123 Main St,Net 30,Preferred vendor\n";
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", 'attachment; filename="maintenance-vendors-template.csv"');
    return reply.send(csv);
  });
}

export { nameToVendorCode, parseVendorsCsv, buildVendorMetadata, mapVendorRow, VENDOR_CODE_REGEX };
