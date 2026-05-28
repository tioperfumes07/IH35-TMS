import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { enforcePsePostingSelection, PseEnforcementError } from "./pse-enforce.middleware.js";
import { suggestPseSelectionByVendorSubtype, syncPseMirror } from "./pse-mirror.service.js";

const listPsItemsQuerySchema = companyQuerySchema.extend({
  category: z.string().trim().min(1).optional(),
});

const enforcePseBodySchema = z.object({
  ps_category_qbo_id: z.string().trim().min(1),
  ps_item_qbo_id: z.string().trim().min(1),
  qbo_account_id: z.union([z.coerce.number(), z.string().trim().min(1)]).optional(),
  bill_id: z.string().uuid().optional(),
});

const suggestBySubtypeQuerySchema = companyQuerySchema.extend({
  vendor_subtype: z.string().trim().min(1).optional(),
  vendor_id: z.string().uuid().optional(),
});

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant"].includes(role);
}

function adminRole(role: string) {
  return role === "Owner" || role === "Administrator";
}

export async function registerPseMirrorRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/pse-mirror/sync-now", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!adminRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    return { ok: true };
  });

  app.post("/api/v1/accounting/pse-mirror/enforce", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = enforcePseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    try {
      const enforced = await enforcePsePostingSelection(String(user.uuid), query.data.operating_company_id, {
        psCategoryQboId: body.data.ps_category_qbo_id,
        psItemQboId: body.data.ps_item_qbo_id,
        qboAccountId: body.data.qbo_account_id ?? null,
      });
      if (body.data.bill_id) {
        await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
          await client.query(
            `
              UPDATE accounting.bills
              SET
                ps_category_qbo_id = $3,
                ps_item_qbo_id = $4,
                ps_qbo_account_id = $5::numeric,
                ps_enforced_at = now(),
                updated_at = now()
              WHERE operating_company_id = $1::uuid
                AND id = $2::uuid
            `,
            [
              query.data.operating_company_id,
              body.data.bill_id,
              enforced.ps_category_qbo_id,
              enforced.ps_item_qbo_id,
              enforced.qbo_account_id,
            ]
          );
        });
      }
      return { ok: true, enforced };
    } catch (error) {
      const message = String((error as Error)?.message ?? "pse_enforcement_failed");
      if (
        message === "pse_category_not_found" ||
        message === "pse_item_not_found" ||
        message === "pse_item_category_mismatch" ||
        message === "pse_account_not_found" ||
        message === "pse_account_mismatch"
      ) {
        return reply.code(409).send({ error: message });
      }
      if (error instanceof PseEnforcementError) {
        return reply.code(400).send({ error: message });
      }
      throw error;
    }
  });

  app.get("/api/v1/accounting/pse-mirror/suggestions/vendor-subtype", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = suggestBySubtypeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    try {
      const suggestion = await suggestPseSelectionByVendorSubtype(String(user.uuid), query.data.operating_company_id, {
        vendorSubtype: query.data.vendor_subtype ?? null,
        vendorId: query.data.vendor_id ?? null,
      });
      return { ok: true, suggestion };
    } catch (error) {
      const message = String((error as Error)?.message ?? "pse_vendor_subtype_suggestion_failed");
      if (message === "vendor_subtype_required") return reply.code(400).send({ error: message });
      if (message === "pse_vendor_subtype_suggestion_not_found") return reply.code(404).send({ error: message });
      if (
        message === "pse_category_not_found" ||
        message === "pse_item_not_found" ||
        message === "pse_item_category_mismatch" ||
        message === "pse_account_not_found" ||
        message === "pse_account_mismatch"
      ) {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });

  app.get("/api/v1/ps-categories", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    const rows = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT qbo_id, name, coa_account_id, active
          FROM accounting.ps_category
          WHERE tenant_id = $1::uuid
          ORDER BY name ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { items: rows };
  });

  app.get("/api/v1/ps-items", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = listPsItemsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    const rows = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      let where = "tenant_id = $1::uuid";
      if (query.data.category) {
        values.push(query.data.category.toLowerCase());
        where += ` AND category_qbo_id = $${values.length}`;
      }
      const res = await client.query(
        `
          SELECT qbo_id, name, category_qbo_id, coa_account_id, active
          FROM accounting.ps_item
          WHERE ${where}
          ORDER BY name ASC
        `,
        values
      );
      return res.rows;
    });

    return { items: rows };
  });

  app.get("/api/v1/coa-accounts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    const rows = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT qbo_id, number, name, type, detail_type, active
          FROM accounting.coa_account
          WHERE tenant_id = $1::uuid
          ORDER BY name ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { items: rows };
  });
}

export default fp(async (app) => {
  await registerPseMirrorRoutes(app);
}, { name: "accounting.registerPseMirrorRoutes" });
