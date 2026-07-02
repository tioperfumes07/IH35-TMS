/** B33: Parts warranty coverage + claims workflow (ARCHIVE-not-DELETE). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  work_order_id: z.string().uuid().optional(),
  include_archived: z.coerce.boolean().optional().default(false),
  status: z.string().trim().optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const partCreateSchema = z.object({
  operating_company_id: z.string().uuid(),
  parts_inventory_id: z.string().uuid().optional(),
  part_description: z.string().trim().min(1).max(500),
  vendor_id: z.string().uuid().optional(),
  warranty_months: z.number().int().positive().default(12),
  purchased_at: z.string().date().optional(),
  original_invoice_number: z.string().trim().max(120).optional().default(""),
  work_order_id: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional().default(""),
});

const claimCreateSchema = z.object({
  operating_company_id: z.string().uuid(),
  parts_warranty_id: z.string().uuid().optional(),
  work_order_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().optional(),
  claim_number: z.string().trim().max(120).optional().default(""),
  part_description: z.string().trim().min(1).max(500),
  claim_amount_cents: z.number().int().min(0).default(0),
  notes: z.string().trim().max(2000).optional().default(""),
  auto_detected: z.boolean().optional().default(false),
});

const claimPatchSchema = z
  .object({
    operating_company_id: z.string().uuid(),
    vendor_id: z.string().uuid().nullable().optional(),
    claim_number: z.string().trim().max(120).optional(),
    part_description: z.string().trim().min(1).max(500).optional(),
    claim_amount_cents: z.number().int().min(0).optional(),
    notes: z.string().trim().max(2000).optional(),
    status: z.enum(["draft", "filed", "pending", "approved", "denied", "reimbursed"]).optional(),
  })
  .refine((v) => Object.keys(v).filter((k) => k !== "operating_company_id").length > 0, {
    message: "at least one field is required",
  });

const fileClaimSchema = z.object({
  operating_company_id: z.string().uuid(),
  claim_number: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const reimburseSchema = z.object({
  operating_company_id: z.string().uuid(),
  reimbursement_amount_cents: z.number().int().min(0),
  notes: z.string().trim().max(2000).optional(),
});

const archiveSchema = z.object({
  operating_company_id: z.string().uuid(),
  archive_reason: z.string().trim().min(3).max(240).optional(),
});

const detectFromWoSchema = z.object({
  operating_company_id: z.string().uuid(),
  work_order_id: z.string().uuid(),
  create_draft_claims: z.boolean().optional().default(false),
});

export function computeWarrantyExpiry(purchasedAt: string, warrantyMonths: number) {
  const base = new Date(`${purchasedAt}T12:00:00Z`);
  const expiry = new Date(base);
  expiry.setUTCMonth(expiry.getUTCMonth() + warrantyMonths);
  return expiry.toISOString().slice(0, 10);
}

export function warrantyClaimStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Draft";
    case "filed":
      return "Filed";
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "reimbursed":
      return "Reimbursed";
    default:
      return status;
  }
}

export function mapWarrantyPartRow(row: Record<string, unknown>) {
  const purchasedAt = String(row.purchased_at ?? "");
  const warrantyMonths = Number(row.warranty_months ?? 12);
  const expiresAt = String(row.expires_at ?? "");
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    parts_inventory_id: row.parts_inventory_id ?? null,
    part_description: row.part_description ?? "",
    vendor_id: row.vendor_id ?? null,
    vendor_name: row.vendor_name ?? null,
    warranty_months: warrantyMonths,
    purchased_at: purchasedAt,
    expires_at: expiresAt,
    is_expired: expiresAt ? expiresAt < today : false,
    original_invoice_number: row.original_invoice_number ?? "",
    work_order_id: row.work_order_id ?? null,
    notes: row.notes ?? "",
    archived_at: row.archived_at ?? null,
    archive_reason: row.archive_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapWarrantyClaimRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    parts_warranty_id: row.parts_warranty_id ?? null,
    work_order_id: row.work_order_id ?? null,
    vendor_id: row.vendor_id ?? null,
    vendor_name: row.vendor_name ?? null,
    claim_number: row.claim_number ?? "",
    status: row.status,
    status_label: warrantyClaimStatusLabel(String(row.status ?? "")),
    part_description: row.part_description ?? "",
    claim_amount_cents: Number(row.claim_amount_cents ?? 0),
    reimbursement_amount_cents:
      row.reimbursement_amount_cents == null ? null : Number(row.reimbursement_amount_cents),
    filed_at: row.filed_at ?? null,
    reimbursement_received_at: row.reimbursement_received_at ?? null,
    notes: row.notes ?? "",
    auto_detected: Boolean(row.auto_detected),
    archived_at: row.archived_at ?? null,
    archive_reason: row.archive_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

type DbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export async function detectWarrantyEligiblePartsFromWorkOrder(
  client: DbClient,
  companyId: string,
  workOrderId: string
) {
  const woRes = await client.query(
    `SELECT id::text, vendor_id::text, external_vendor_id::text
     FROM maintenance.work_orders
     WHERE id = $1 AND operating_company_id = $2
     LIMIT 1`,
    [workOrderId, companyId]
  );
  const wo = woRes.rows[0];
  if (!wo) return { work_order_id: workOrderId, eligible: [] as Record<string, unknown>[] };

  const linesRes = await client.query(
    `SELECT uuid::text AS id, line_type, description, total_cost, part_uuid::text
     FROM maintenance.work_order_lines
     WHERE work_order_uuid = $1 AND line_type = 'parts'
     ORDER BY created_at ASC`,
    [workOrderId]
  );

  const today = new Date().toISOString().slice(0, 10);
  const eligible: Record<string, unknown>[] = [];

  for (const line of linesRes.rows) {
    const partUuid = line.part_uuid ? String(line.part_uuid) : null;
    let warrantyRow: Record<string, unknown> | null = null;

    if (partUuid) {
      const byInventory = await client.query(
        `SELECT pw.id::text, pw.part_description, pw.vendor_id::text, pw.expires_at::text,
                pw.warranty_months, pw.parts_inventory_id::text, v.display_name AS vendor_name
         FROM maintenance.parts_warranty pw
         LEFT JOIN mdata.vendors v ON v.id = pw.vendor_id
         WHERE pw.operating_company_id = $1
           AND pw.parts_inventory_id = $2
           AND pw.archived_at IS NULL
           AND pw.expires_at >= $3
         ORDER BY pw.expires_at DESC
         LIMIT 1`,
        [companyId, partUuid, today]
      );
      warrantyRow = byInventory.rows[0] ?? null;
    }

    if (!warrantyRow) {
      const byWo = await client.query(
        `SELECT pw.id::text, pw.part_description, pw.vendor_id::text, pw.expires_at::text,
                pw.warranty_months, pw.parts_inventory_id::text, v.display_name AS vendor_name
         FROM maintenance.parts_warranty pw
         LEFT JOIN mdata.vendors v ON v.id = pw.vendor_id
         WHERE pw.operating_company_id = $1
           AND pw.work_order_id = $2
           AND pw.archived_at IS NULL
           AND pw.expires_at >= $3
           AND lower(pw.part_description) = lower($4)
         ORDER BY pw.expires_at DESC
         LIMIT 1`,
        [companyId, workOrderId, today, String(line.description ?? "")]
      );
      warrantyRow = byWo.rows[0] ?? null;
    }

    if (!warrantyRow) continue;

    eligible.push({
      work_order_line_id: line.id,
      line_description: line.description,
      line_amount: line.total_cost,
      parts_warranty_id: warrantyRow.id,
      part_description: warrantyRow.part_description,
      vendor_id: warrantyRow.vendor_id ?? wo.vendor_id ?? wo.external_vendor_id ?? null,
      vendor_name: warrantyRow.vendor_name ?? null,
      expires_at: warrantyRow.expires_at,
      warranty_months: warrantyRow.warranty_months,
      suggested_claim_amount_cents: Math.round(Number(line.total_cost ?? 0) * 100),
    });
  }

  return { work_order_id: workOrderId, eligible };
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(
  userId: string,
  companyId: string,
  fn: (client: DbClient) => Promise<T>
) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

const PART_SELECT = `
  SELECT
    pw.id::text,
    pw.operating_company_id::text,
    pw.parts_inventory_id::text,
    pw.part_description,
    pw.vendor_id::text,
    v.display_name AS vendor_name,
    pw.warranty_months,
    pw.purchased_at::text,
    pw.expires_at::text,
    pw.original_invoice_number,
    pw.work_order_id::text,
    pw.notes,
    pw.archived_at,
    pw.archive_reason,
    pw.created_at,
    pw.updated_at
  FROM maintenance.parts_warranty pw
  LEFT JOIN mdata.vendors v ON v.id = pw.vendor_id
`;

const CLAIM_SELECT = `
  SELECT
    wc.id::text,
    wc.operating_company_id::text,
    wc.parts_warranty_id::text,
    wc.work_order_id::text,
    wc.vendor_id::text,
    v.display_name AS vendor_name,
    wc.claim_number,
    wc.status,
    wc.part_description,
    wc.claim_amount_cents,
    wc.reimbursement_amount_cents,
    wc.filed_at,
    wc.reimbursement_received_at,
    wc.notes,
    wc.auto_detected,
    wc.archived_at,
    wc.archive_reason,
    wc.created_at,
    wc.updated_at
  FROM maintenance.warranty_claims wc
  LEFT JOIN mdata.vendors v ON v.id = wc.vendor_id
`;

async function fetchClaimById(client: DbClient, companyId: string, id: string) {
  const res = await client.query(`${CLAIM_SELECT} WHERE wc.id = $1 AND wc.operating_company_id = $2`, [id, companyId]);
  return res.rows[0] ?? null;
}

export async function registerMaintenanceWarrantyRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/warranty/parts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["pw.operating_company_id = $1"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (!parsed.data.include_archived) filters.push("pw.archived_at IS NULL");
      if (parsed.data.work_order_id) {
        values.push(parsed.data.work_order_id);
        filters.push(`pw.work_order_id = $${values.length}`);
      }
      const res = await client.query(
        `${PART_SELECT} WHERE ${filters.join(" AND ")} ORDER BY pw.expires_at DESC, pw.created_at DESC`,
        values
      );
      return res.rows.map(mapWarrantyPartRow);
    });
    return reply.send({ rows });
  });

  app.post("/api/v1/maintenance/warranty/parts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = partCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const purchasedAt = body.purchased_at ?? new Date().toISOString().slice(0, 10);
    const expiresAt = computeWarrantyExpiry(purchasedAt, body.warranty_months);

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `INSERT INTO maintenance.parts_warranty (
          operating_company_id, parts_inventory_id, part_description, vendor_id,
          warranty_months, purchased_at, expires_at, original_invoice_number, work_order_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id::text`,
        [
          body.operating_company_id,
          body.parts_inventory_id ?? null,
          body.part_description,
          body.vendor_id ?? null,
          body.warranty_months,
          purchasedAt,
          expiresAt,
          body.original_invoice_number,
          body.work_order_id ?? null,
          body.notes,
        ]
      );
      const id = String(res.rows[0]?.id);
      const fetched = await client.query(`${PART_SELECT} WHERE pw.id = $1`, [id]);
      await appendCrudAudit(client, user.uuid, "maintenance.parts_warranty.created", {
        part_description: body.part_description,
        expires_at: expiresAt,
      });
      return fetched.rows[0];
    });
    return reply.code(201).send(mapWarrantyPartRow(row ?? {}));
  });

  app.get("/api/v1/maintenance/warranty/claims", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["wc.operating_company_id = $1"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (!parsed.data.include_archived) filters.push("wc.archived_at IS NULL");
      if (parsed.data.work_order_id) {
        values.push(parsed.data.work_order_id);
        filters.push(`wc.work_order_id = $${values.length}`);
      }
      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`wc.status = $${values.length}`);
      }
      const res = await client.query(
        `${CLAIM_SELECT} WHERE ${filters.join(" AND ")} ORDER BY wc.created_at DESC`,
        values
      );
      return res.rows.map(mapWarrantyClaimRow);
    });
    return reply.send({ rows });
  });

  app.post("/api/v1/maintenance/warranty/claims", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = claimCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `INSERT INTO maintenance.warranty_claims (
          operating_company_id, parts_warranty_id, work_order_id, vendor_id, claim_number,
          part_description, claim_amount_cents, notes, auto_detected, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id::text`,
        [
          body.operating_company_id,
          body.parts_warranty_id ?? null,
          body.work_order_id ?? null,
          body.vendor_id ?? null,
          body.claim_number,
          body.part_description,
          body.claim_amount_cents,
          body.notes,
          body.auto_detected,
          user.uuid,
        ]
      );
      const id = String(res.rows[0]?.id);
      const fetched = await fetchClaimById(client, body.operating_company_id, id);
      await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.created", {
        part_description: body.part_description,
      });
      return fetched;
    });
    return reply.code(201).send(mapWarrantyClaimRow(row ?? {}));
  });

  app.patch("/api/v1/maintenance/warranty/claims/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const parsed = claimPatchSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }
    const body = parsed.data;

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existing = await fetchClaimById(client, body.operating_company_id, params.data.id);
      if (!existing || existing.archived_at) return null;

      const sets: string[] = ["updated_at = now()"];
      const values: unknown[] = [];
      const add = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (body.vendor_id !== undefined) add("vendor_id", body.vendor_id);
      if (body.claim_number !== undefined) add("claim_number", body.claim_number);
      if (body.part_description !== undefined) add("part_description", body.part_description);
      if (body.claim_amount_cents !== undefined) add("claim_amount_cents", body.claim_amount_cents);
      if (body.notes !== undefined) add("notes", body.notes);
      if (body.status !== undefined) add("status", body.status);

      values.push(params.data.id, body.operating_company_id);
      await client.query(
        `UPDATE maintenance.warranty_claims SET ${sets.join(", ")}
         WHERE id = $${values.length - 1} AND operating_company_id = $${values.length} AND archived_at IS NULL`,
        values
      );
      await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.updated", { id: params.data.id });
      return fetchClaimById(client, body.operating_company_id, params.data.id);
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send(mapWarrantyClaimRow(row));
  });

  app.post("/api/v1/maintenance/warranty/claims/:id/file", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const parsed = fileClaimSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }

    const row = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const existing = await fetchClaimById(client, parsed.data.operating_company_id, params.data.id);
      if (!existing || existing.archived_at) return null;

      await client.query(
        `UPDATE maintenance.warranty_claims
         SET status = 'filed',
             filed_at = now(),
             claim_number = COALESCE(NULLIF($3, ''), claim_number),
             notes = CASE WHEN $4 IS NULL OR $4 = '' THEN notes ELSE $4 END,
             updated_at = now()
         WHERE id = $1 AND operating_company_id = $2 AND archived_at IS NULL`,
        [
          params.data.id,
          parsed.data.operating_company_id,
          parsed.data.claim_number ?? "",
          parsed.data.notes ?? null,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.filed", { id: params.data.id });
      return fetchClaimById(client, parsed.data.operating_company_id, params.data.id);
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send(mapWarrantyClaimRow(row));
  });

  app.post("/api/v1/maintenance/warranty/claims/:id/reimburse", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const parsed = reimburseSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }

    const row = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const existing = await fetchClaimById(client, parsed.data.operating_company_id, params.data.id);
      if (!existing || existing.archived_at) return null;

      await client.query(
        `UPDATE maintenance.warranty_claims
         SET status = 'reimbursed',
             reimbursement_amount_cents = $3,
             reimbursement_received_at = now(),
             notes = CASE WHEN $4 IS NULL OR $4 = '' THEN notes ELSE $4 END,
             updated_at = now()
         WHERE id = $1 AND operating_company_id = $2 AND archived_at IS NULL`,
        [
          params.data.id,
          parsed.data.operating_company_id,
          parsed.data.reimbursement_amount_cents,
          parsed.data.notes ?? null,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.reimbursed", {
        id: params.data.id,
        reimbursement_amount_cents: parsed.data.reimbursement_amount_cents,
      });
      return fetchClaimById(client, parsed.data.operating_company_id, params.data.id);
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send(mapWarrantyClaimRow(row));
  });

  app.post("/api/v1/maintenance/warranty/claims/:id/archive", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const parsed = archiveSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }

    await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      await client.query(
        `UPDATE maintenance.warranty_claims
         SET archived_at = now(), archive_reason = $3, updated_at = now()
         WHERE id = $1 AND operating_company_id = $2 AND archived_at IS NULL`,
        [params.data.id, parsed.data.operating_company_id, parsed.data.archive_reason ?? "Archived from warranty claims"]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.archived", { id: params.data.id });
    });
    return reply.send({ ok: true, id: params.data.id });
  });

  app.post("/api/v1/maintenance/warranty/detect-from-wo", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = detectFromWoSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const detection = await detectWarrantyEligiblePartsFromWorkOrder(
        client,
        parsed.data.operating_company_id,
        parsed.data.work_order_id
      );

      if (!parsed.data.create_draft_claims) return detection;

      const created: ReturnType<typeof mapWarrantyClaimRow>[] = [];
      for (const item of detection.eligible) {
        const insert = await client.query(
          `INSERT INTO maintenance.warranty_claims (
            operating_company_id, parts_warranty_id, work_order_id, vendor_id,
            part_description, claim_amount_cents, auto_detected, status, created_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, true, 'draft', $7)
          RETURNING id::text`,
          [
            parsed.data.operating_company_id,
            item.parts_warranty_id ?? null,
            parsed.data.work_order_id,
            item.vendor_id ?? null,
            item.part_description ?? item.line_description,
            item.suggested_claim_amount_cents ?? 0,
            user.uuid,
          ]
        );
        const claim = await fetchClaimById(
          client,
          parsed.data.operating_company_id,
          String(insert.rows[0]?.id)
        );
        if (claim) created.push(mapWarrantyClaimRow(claim));
      }

      await appendCrudAudit(client, user.uuid, "maintenance.warranty_detected_from_wo", {
        work_order_id: parsed.data.work_order_id,
        eligible_count: detection.eligible.length,
        created_count: created.length,
      });

      return { ...detection, created_claims: created };
    });

    return reply.send(result);
  });
}
