/** B23 canonical company parts inventory — all routes read/write maintenance.parts_inventory. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { PART_INVENTORY_CATEGORY_VALUES } from "./part-inventory-categories.js";

const partCategorySchema = z.enum(PART_INVENTORY_CATEGORY_VALUES);

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().optional(),
  vendor_id: z.string().uuid().optional(),
  include_voided: z.coerce.boolean().optional().default(false),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  // INV-1: part_number is now a REAL, persisted SKU. Optional on input — when the user leaves the SKU
  // field blank the INSERT generates a stable "PART-XXXXXXXX" SKU (no more fake id::text SKU).
  part_number: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(250),
  // INV-LINK-01: canonical FK on maintenance.parts_inventory.vendor_id → mdata.vendors.
  vendor_id: z.string().uuid().optional(),
  vendor_default: z.string().trim().max(250).optional(),
  unit_cost: z.number().nonnegative().optional(),
  qty_on_hand: z.number().int().nonnegative().default(0),
  reorder_threshold: z.number().int().nonnegative().default(0),
  location: z.string().trim().max(120).optional(),
  // INV-CAT-01: category required on create — must be a known taxonomy token (no blank/null).
  category: partCategorySchema,
  notes: z.string().trim().max(2000).optional(),
  // forward-compat: the drawer also posts is_active; accept + ignore so it is not a validation_error.
  is_active: z.boolean().optional(),
});

const updateSchema = z
  .object({
    part_number: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(250).optional(),
    vendor_id: z.string().uuid().nullable().optional(),
    vendor_default: z.string().trim().max(250).nullable().optional(),
    unit_cost: z.number().nonnegative().nullable().optional(),
    qty_on_hand: z.number().int().nonnegative().optional(),
    reorder_threshold: z.number().int().nonnegative().optional(),
    location: z.string().trim().max(120).nullable().optional(),
    // INV-1: category + notes are now editable + persisted.
    // INV-CAT-01: when category is sent on update it must be a valid taxonomy token (not null/blank).
    category: partCategorySchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const voidSchema = z.object({ void_reason: z.string().trim().min(3).max(240) });

type CsvPartRow = {
  part_number: string;
  name: string;
  unit_cost: number | null;
  qty_on_hand: number;
  reorder_threshold: number;
  location: string | null;
  category: string | null;
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.replace(/^\ufeff/, "").trim());
}

function parsePartsCsv(text: string): CsvPartRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV requires header and at least one row");
  const headers = parseCsvLine(lines[0]);
  for (const key of ["part_number", "name", "qty_on_hand"]) {
    if (!headers.includes(key)) throw new Error(`CSV missing required column: ${key}`);
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    const get = (key: string) => row[headers.indexOf(key)] ?? "";
    return {
      part_number: get("part_number"),
      name: get("name"),
      unit_cost: get("unit_cost") ? Number(get("unit_cost")) : null,
      qty_on_hand: Number(get("qty_on_hand") || "0"),
      reorder_threshold: Number(get("reorder_threshold") || "0"),
      location: get("location") || null,
      // INV-1: category is an optional CSV column; persisted when present.
      category: headers.includes("category") ? (get("category") || null) : null,
    };
  });
}

async function vendorBelongsToCompany(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  vendorId: string,
  companyId: string,
) {
  const result = await client.query(
    `SELECT id
       FROM mdata.vendors
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND deactivated_at IS NULL
      LIMIT 1`,
    [vendorId, companyId],
  );
  return Boolean(result.rows[0]);
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenancePartsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/parts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters = ["pi.operating_company_id = $1::uuid"];
      if (!query.data.include_voided) filters.push("pi.part_description NOT LIKE '[VOID] %'");
      if (query.data.vendor_id) {
        values.push(query.data.vendor_id);
        filters.push(`pi.vendor_id = $${values.length}::uuid`);
      }
      if (query.data.search) {
        values.push(`%${query.data.search}%`);
        const idx = values.length;
        // INV-1: search the real SKU + part_number too (not just the raw id/description).
        filters.push(
          `(pi.part_number ILIKE $${idx} OR pi.id::text ILIKE $${idx} OR pi.part_description ILIKE $${idx})`,
        );
      }
      const result = await client.query(
        `
          SELECT
            pi.id,
            -- INV-1: real, persisted SKU (fallback to a stable derived SKU for any un-backfilled row).
            COALESCE(pi.part_number, 'PART-' || upper(substr(replace(pi.id::text, '-', ''), 1, 8))) AS part_number,
            pi.part_description AS name,
            pi.category,
            pi.notes,
            pi.vendor_id::text AS vendor_id,
            -- CLS-SILENT-CAP / CLS-UUID-LABEL: same-opco vendor name on the list path so the FE
            -- never enriches from a capped listVendors(limit:N) roster (drops names past the page).
            -- LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL: the join alone silently drops
            -- a vendor once deactivated (mdata.vendors' own RLS excludes deactivated_at IS NOT NULL
            -- rows for a non-bypass reader) even though the FK is still valid and the part still
            -- legitimately cites it. mdata.resolve_vendor_label_same_company (migration 202612780000)
            -- is the canonical, same-company-only, label-only fallback used only when the join misses.
            COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(pi.vendor_id, pi.operating_company_id)) AS vendor_name,
            pi.last_purchase_amount AS unit_cost,
            pi.on_hand_qty AS qty_on_hand,
            pi.reorder_threshold,
            pi.location,
            'manual'::text AS source,
            CASE WHEN pi.part_description LIKE '[VOID] %' THEN pi.updated_at ELSE NULL END AS voided_at,
            NULL::text AS voided_reason
          FROM maintenance.parts_inventory pi
          LEFT JOIN mdata.vendors v
            ON v.id = pi.vendor_id
           AND v.operating_company_id = pi.operating_company_id
          WHERE ${filters.join(" AND ")}
          ORDER BY pi.updated_at DESC, pi.created_at DESC
        `,
        values
      );
      return result.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/parts/kpis", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const kpis = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          SELECT
            COUNT(*)::int AS total_parts,
            COUNT(*) FILTER (WHERE on_hand_qty <= reorder_threshold)::int AS low_stock_count,
            COALESCE(SUM(COALESCE(last_purchase_amount, 0) * COALESCE(on_hand_qty, 0)), 0)::numeric AS total_inventory_value
          FROM maintenance.parts_inventory
          WHERE operating_company_id = $1::uuid
            AND part_description NOT LIKE '[VOID] %'
        `,
        [query.data.operating_company_id]
      );
      return result.rows[0];
    });
    return kpis;
  });

  app.post("/api/v1/maintenance/parts", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const created = await withCompany(user.uuid, companyId, async (client) => {
      if (body.data.vendor_id && !(await vendorBelongsToCompany(client, body.data.vendor_id, companyId))) {
        return { __error: "linked_entity_not_in_operating_company" as const };
      }
      const result = await client.query(
        `
          INSERT INTO maintenance.parts_inventory (
            operating_company_id,
            part_description,
            last_purchase_amount,
            on_hand_qty,
            location,
            part_number,
            category,
            notes,
            vendor_id,
            reorder_threshold
          )
          VALUES (
            $1,$2,$3,$4,$5,
            -- INV-1: persist the user-entered SKU; generate a stable "PART-XXXXXXXX" one when blank.
            COALESCE(NULLIF(btrim($6), ''), 'PART-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
            $7,
            $8,
            $9,
            $10
          )
          RETURNING
            id, part_number, part_description AS name, category, notes, vendor_id::text AS vendor_id, last_purchase_amount AS unit_cost, on_hand_qty AS qty_on_hand,
            reorder_threshold, location, 'manual'::text AS source, CASE WHEN part_description LIKE '[VOID] %' THEN updated_at ELSE NULL END AS voided_at, NULL::text AS voided_reason
        `,
        [
          companyId,
          body.data.name,
          body.data.unit_cost ?? null,
          body.data.qty_on_hand,
          body.data.location ?? null,
          body.data.part_number ?? null,
          body.data.category ?? null,
          body.data.notes ?? null,
          body.data.vendor_id ?? null,
          body.data.reorder_threshold,
        ]
      );
      const createdPart = result.rows[0];
      if (!createdPart?.id) throw new Error("maintenance_part_insert_returned_no_row");
      await appendCrudAudit(client, user.uuid, "maintenance.parts.created", {
        operating_company_id: companyId,
        resource_id: createdPart.id,
        part_number: createdPart.part_number,
        category: body.data.category ?? null,
        reorder_threshold: body.data.reorder_threshold,
      });
      return createdPart;
    });
    if ("__error" in created) return reply.code(400).send({ error: created.__error });
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/maintenance/parts/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = updateSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const updated = await withCompany(user.uuid, companyId, async (client) => {
      if (body.data.vendor_id && !(await vendorBelongsToCompany(client, body.data.vendor_id, companyId))) {
        return { __error: "linked_entity_not_in_operating_company" as const };
      }
      const oldRes = await client.query(
        `SELECT * FROM maintenance.parts_inventory WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, companyId],
      );
      const oldRow = oldRes.rows[0];
      if (!oldRow) return null;
      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (col: string, val: unknown) => {
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };
      if ("name" in body.data) {
        add("part_description", body.data.name ?? null);
      }
      if ("unit_cost" in body.data) add("last_purchase_amount", body.data.unit_cost ?? null);
      if ("qty_on_hand" in body.data) add("on_hand_qty", body.data.qty_on_hand ?? null);
      if ("reorder_threshold" in body.data) add("reorder_threshold", body.data.reorder_threshold);
      if ("location" in body.data) add("location", body.data.location ?? null);
      // INV-1: part_number/category/notes are now real, editable columns.
      if ("part_number" in body.data) add("part_number", body.data.part_number ?? null);
      if ("category" in body.data) add("category", body.data.category ?? null);
      if ("notes" in body.data) add("notes", body.data.notes ?? null);
      if ("vendor_id" in body.data) add("vendor_id", body.data.vendor_id ?? null);
      values.push(params.data.id);
      values.push(companyId);
      const result = await client.query(
        `UPDATE maintenance.parts_inventory SET ${setParts.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 1}::uuid AND operating_company_id = $${values.length}::uuid
          RETURNING *`,
        values
      );
      const newRow = result.rows[0];
      await appendCrudAudit(client, user.uuid, "maintenance.parts.updated", {
        operating_company_id: companyId,
        resource_id: params.data.id,
        changes: buildPatchChanges(
          body.data as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          newRow as Record<string, unknown>
        ),
      });
      return {
        id: newRow.id,
          // INV-1: return the real, persisted SKU (fallback to a stable derived one), not id::text.
          part_number:
            newRow.part_number && String(newRow.part_number).trim()
              ? newRow.part_number
              : `PART-${String(newRow.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
          name: newRow.part_description,
          category: newRow.category ?? null,
          notes: newRow.notes ?? null,
          vendor_id: newRow.vendor_id ?? null,
          unit_cost: newRow.last_purchase_amount,
          qty_on_hand: newRow.on_hand_qty,
          reorder_threshold: newRow.reorder_threshold,
          location: newRow.location,
          source: "manual",
          voided_at: String(newRow.part_description ?? "").startsWith("[VOID] ") ? newRow.updated_at : null,
          voided_reason: null,
      };
    });
    if (updated && "__error" in updated) return reply.code(400).send({ error: updated.__error });
    if (!updated) return reply.code(404).send({ error: "maintenance_part_not_found" });
    return updated;
  });

  app.patch("/api/v1/maintenance/parts/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = voidSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const result = await withCompany(user.uuid, companyId, async (client) => {
      const updated = await client.query(
        `UPDATE maintenance.parts_inventory SET part_description = CONCAT('[VOID] ', COALESCE(part_description, ''), ' | ', $2), updated_at = now() WHERE id = $1 AND operating_company_id = $3::uuid RETURNING id`,
        [params.data.id, body.data.void_reason, companyId]
      );
      if (!updated.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.parts.voided", {
        operating_company_id: companyId,
        resource_id: params.data.id,
        void_reason: body.data.void_reason,
      });
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: "maintenance_part_not_found" });
    return { ok: true };
  });

  app.get("/api/v1/maintenance/parts/import-template", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (_req, reply) => {
    const csv = "part_number,name,vendor_default,unit_cost,qty_on_hand,reorder_threshold,location\nP-001,Oil Filter,Acme Parts,18.50,12,4,Bin-A1\nP-002,Brake Pad,Acme Parts,39.99,8,3,Bin-B4\n";
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="maintenance-parts-template.csv"')
      .send(csv);
  });

  app.post("/api/v1/maintenance/parts/import", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
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
    let rows: CsvPartRow[] = [];
    try {
      rows = parsePartsCsv(csvText);
    } catch (error) {
      return reply.code(400).send({ error: "invalid_csv", message: (error as Error).message });
    }
    const summary = await withCompany(user.uuid, companyId, async (client) => {
      let inserted = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const validationFailureThreshold = 5;
      await client.query("BEGIN");
      try {
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          try {
            if (!row.part_number || !row.name) throw new Error("part_number and name are required");
            await client.query(
              `
                INSERT INTO maintenance.parts_inventory (
                  operating_company_id, part_description, last_purchase_amount, on_hand_qty, reorder_threshold, location, part_number, category
                )
                VALUES (
                  $1,$2,$3,$4,$5,$6,
                  -- INV-1: persist the CSV part_number as the real SKU (generate a stable one if blank).
                  COALESCE(NULLIF(btrim($7), ''), 'PART-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
                  $8
                )
              `,
              [
                companyId,
                row.name,
                row.unit_cost,
                row.qty_on_hand,
                row.reorder_threshold,
                row.location,
                row.part_number,
                row.category,
              ]
            );
            inserted += 1;
          } catch (error) {
            errors.push({ row: i + 2, message: (error as Error).message });
            if (errors.length > validationFailureThreshold) break;
          }
        }
        if (errors.length > 0) {
          await client.query("ROLLBACK");
        } else {
          await client.query("COMMIT");
          await appendCrudAudit(client, user.uuid, "maintenance.parts.imported", {
            operating_company_id: companyId,
            imported_rows: inserted,
          });
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      return {
        inserted_rows: inserted,
        invalid_rows: errors.length,
        rolled_back: errors.length > 0,
        errors,
      };
    });
    return summary;
  });
}
