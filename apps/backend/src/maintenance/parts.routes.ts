/** B23 canonical company parts inventory — all routes read/write maintenance.parts_inventory. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().optional(),
  include_voided: z.coerce.boolean().optional().default(false),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  part_number: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(250),
  vendor_default: z.string().trim().max(250).optional(),
  unit_cost: z.number().nonnegative().optional(),
  qty_on_hand: z.number().int().nonnegative().default(0),
  reorder_threshold: z.number().int().nonnegative().default(0),
  location: z.string().trim().max(120).optional(),
});

const updateSchema = z
  .object({
    part_number: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(250).optional(),
    vendor_default: z.string().trim().max(250).nullable().optional(),
    unit_cost: z.number().nonnegative().nullable().optional(),
    qty_on_hand: z.number().int().nonnegative().optional(),
    reorder_threshold: z.number().int().nonnegative().optional(),
    location: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const voidSchema = z.object({ void_reason: z.string().trim().min(3).max(240) });

type CsvPartRow = {
  part_number: string;
  name: string;
  unit_cost: number | null;
  qty_on_hand: number;
  location: string | null;
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
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
      location: get("location") || null,
    };
  });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenancePartsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/parts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters = ["operating_company_id = $1"];
      if (!query.data.include_voided) filters.push("part_description NOT LIKE '[VOID] %'");
      if (query.data.search) {
        values.push(`%${query.data.search}%`);
        const idx = values.length;
        filters.push(`(id::text ILIKE $${idx} OR part_description ILIKE $${idx})`);
      }
      const result = await client.query(
        `
          SELECT
            id,
            id::text AS part_number,
            part_description AS name,
            NULL::text AS vendor_default,
            last_purchase_amount AS unit_cost,
            on_hand_qty AS qty_on_hand,
            0::int AS reorder_threshold,
            location,
            'manual'::text AS source,
            CASE WHEN part_description LIKE '[VOID] %' THEN updated_at ELSE NULL END AS voided_at,
            NULL::text AS voided_reason
          FROM maintenance.parts_inventory
          WHERE ${filters.join(" AND ")}
          ORDER BY updated_at DESC, created_at DESC
        `,
        values
      );
      return result.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/parts/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const kpis = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          SELECT
            COUNT(*)::int AS total_parts,
            COUNT(*) FILTER (WHERE on_hand_qty <= 2)::int AS low_stock_count,
            COALESCE(SUM(COALESCE(last_purchase_amount, 0) * COALESCE(on_hand_qty, 0)), 0)::numeric AS total_inventory_value
          FROM maintenance.parts_inventory
          WHERE operating_company_id = $1
            AND part_description NOT LIKE '[VOID] %'
        `,
        [query.data.operating_company_id]
      );
      return result.rows[0];
    });
    return kpis;
  });

  app.post("/api/v1/maintenance/parts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const created = await withCompany(user.uuid, companyId, async (client) => {
      const result = await client.query(
        `
          INSERT INTO maintenance.parts_inventory (
            operating_company_id,
            part_description,
            last_purchase_amount,
            on_hand_qty,
            location
          )
          VALUES ($1,$2,$3,$4,$5)
          RETURNING
            id, id::text AS part_number, part_description AS name, NULL::text AS vendor_default, last_purchase_amount AS unit_cost, on_hand_qty AS qty_on_hand,
            0::int AS reorder_threshold, location, 'manual'::text AS source, CASE WHEN part_description LIKE '[VOID] %' THEN updated_at ELSE NULL END AS voided_at, NULL::text AS voided_reason
        `,
        [
          companyId,
          body.data.name,
          body.data.unit_cost ?? null,
          body.data.qty_on_hand,
          body.data.location ?? null,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.parts.created", {
        resource_id: result.rows[0].id,
        part_number: body.data.part_number,
      });
      return result.rows[0];
    });
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/maintenance/parts/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = updateSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const updated = await withCompany(user.uuid, companyId, async (client) => {
      const oldRes = await client.query(`SELECT * FROM maintenance.parts_inventory WHERE id = $1 LIMIT 1`, [params.data.id]);
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
      if ("location" in body.data) add("location", body.data.location ?? null);
      values.push(params.data.id);
      const result = await client.query(
        `UPDATE maintenance.parts_inventory SET ${setParts.join(", ")}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
        values
      );
      const newRow = result.rows[0];
      await appendCrudAudit(client, user.uuid, "maintenance.parts.updated", {
        resource_id: params.data.id,
        changes: buildPatchChanges(
          body.data as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          newRow as Record<string, unknown>
        ),
      });
      return {
        id: newRow.id,
          part_number: String(newRow.id),
          name: newRow.part_description,
          vendor_default: null,
          unit_cost: newRow.last_purchase_amount,
        qty_on_hand: newRow.on_hand_qty,
          reorder_threshold: 0,
        location: newRow.location,
          source: "manual",
          voided_at: String(newRow.part_description ?? "").startsWith("[VOID] ") ? newRow.updated_at : null,
          voided_reason: null,
      };
    });
    if (!updated) return reply.code(404).send({ error: "maintenance_part_not_found" });
    return updated;
  });

  app.patch("/api/v1/maintenance/parts/:id/void", async (req, reply) => {
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
        `UPDATE maintenance.parts_inventory SET part_description = CONCAT('[VOID] ', COALESCE(part_description, ''), ' | ', $2), updated_at = now() WHERE id = $1 AND operating_company_id = $3 RETURNING id`,
        [params.data.id, body.data.void_reason, companyId]
      );
      if (!updated.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.parts.voided", {
        resource_id: params.data.id,
        void_reason: body.data.void_reason,
      });
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: "maintenance_part_not_found" });
    return { ok: true };
  });

  app.get("/api/v1/maintenance/parts/import-template", async (_req, reply) => {
    const csv = "part_number,name,vendor_default,unit_cost,qty_on_hand,reorder_threshold,location\nP-001,Oil Filter,Acme Parts,18.50,12,4,Bin-A1\nP-002,Brake Pad,Acme Parts,39.99,8,3,Bin-B4\n";
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="maintenance-parts-template.csv"')
      .send(csv);
  });

  app.post("/api/v1/maintenance/parts/import", async (req, reply) => {
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
                  operating_company_id, part_description, last_purchase_amount, on_hand_qty, location
                )
                VALUES ($1,$2,$3,$4,$5)
              `,
              [
                companyId,
                row.name,
                row.unit_cost,
                row.qty_on_hand,
                row.location,
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
