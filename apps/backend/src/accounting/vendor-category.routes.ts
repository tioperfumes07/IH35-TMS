import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { sendZodValidation } from "../lib/zod-http-error.js";
import { VENDOR_CATEGORY_VALUES } from "./vendor-category.constants.js";

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"].includes(role);
}

const vendorCategoryEnum = z.enum(VENDOR_CATEGORY_VALUES as unknown as [string, ...string[]]);

const batchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  vendor_ids: z.array(z.string().uuid()).min(1).max(500),
  category: vendorCategoryEnum,
  lock: z.boolean().optional().default(false),
});

const singleCategoryBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  category: vendorCategoryEnum,
  lock: z.boolean().optional().default(false),
});

const idParamSchema = z.object({ id: z.string().uuid() });

async function appendVendorCategoryAudit(
  client: { query: (sql: string, args?: unknown[]) => Promise<unknown> },
  userId: string,
  vendorId: string,
  payload: { from: string | null; to: string; locked: boolean }
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
    "vendor.category_updated",
    "info",
    JSON.stringify({ vendor_id: vendorId, ...payload }),
    userId,
    "P7-VENDOR-CATEGORY",
  ]);
}

export async function registerVendorCategoryRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/vendors/batch-categorize", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = batchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, vendor_ids, category, lock } = parsed.data;
    const result = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      let updated = 0;
      const skipped: Array<{ id: string; reason: string }> = [];

      for (const vid of vendor_ids) {
        const sel = await client.query(
          `
            SELECT id, vendor_category, vendor_category_locked_at
            FROM mdata.vendors
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [vid, operating_company_id]
        );
        const row = sel.rows[0] as
          | { id: string; vendor_category: string | null; vendor_category_locked_at: string | null }
          | undefined;
        if (!row) {
          skipped.push({ id: vid, reason: "not_found" });
          continue;
        }
        const isLocked = row.vendor_category_locked_at != null;
        const categoryChanging = row.vendor_category !== category;
        if (isLocked && !lock && categoryChanging) {
          skipped.push({ id: vid, reason: "locked" });
          continue;
        }
        if (!categoryChanging && !lock) {
          continue;
        }

        const upd = await client.query(
          `
            UPDATE mdata.vendors
            SET vendor_category = $3,
                vendor_category_locked_at = CASE WHEN $4::boolean THEN now() ELSE vendor_category_locked_at END,
                updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            RETURNING vendor_category
          `,
          [vid, operating_company_id, category, lock]
        );
        if ((upd.rowCount ?? 0) === 0) {
          skipped.push({ id: vid, reason: "not_found" });
          continue;
        }
        updated += 1;
        await appendVendorCategoryAudit(client, user.uuid, vid, {
          from: row.vendor_category,
          to: category,
          locked: lock || isLocked,
        });
      }

      return { updated, skipped };
    });

    return result;
  });

  app.patch("/api/v1/accounting/vendors/:id/category", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);

    const parsed = singleCategoryBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const vid = params.data.id;
    const { operating_company_id, category, lock } = parsed.data;

    const result = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const sel = await client.query(
        `
          SELECT id, vendor_category, vendor_category_locked_at
          FROM mdata.vendors
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [vid, operating_company_id]
      );
      const row = sel.rows[0] as
        | { id: string; vendor_category: string | null; vendor_category_locked_at: string | null }
        | undefined;
      if (!row) return { error: "not_found" as const };
      const isLocked = row.vendor_category_locked_at != null;
      const categoryChanging = row.vendor_category !== category;
      if (isLocked && !lock && categoryChanging) return { error: "locked" as const };
      if (!categoryChanging && !lock) {
        return { ok: true as const, vendor: row };
      }

      await client.query(
        `
          UPDATE mdata.vendors
          SET vendor_category = $3,
              vendor_category_locked_at = CASE WHEN $4::boolean THEN now() ELSE vendor_category_locked_at END,
              updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        `,
        [vid, operating_company_id, category, lock]
      );
      await appendVendorCategoryAudit(client, user.uuid, vid, {
        from: row.vendor_category,
        to: category,
        locked: lock || isLocked,
      });
      return { ok: true as const };
    });

    if ("error" in result && result.error === "not_found") return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "locked") return reply.code(409).send({ error: "locked" });

    return { ok: true };
  });
}
