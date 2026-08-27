import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

const querySchema = companyQuerySchema;

/** Per-catalog latch status — never conflate "table missing" with "zero rows". */
export type WoCostSourceStatus = "available" | "fallback" | "unavailable";

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety", "Mechanic"].includes(role);
}

export async function registerWoCostContextRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/maintenance/wo-cost-context",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const oc = parsed.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, oc, async (client) => {
      // LST-F06 / LST-PICKER-02 leftover: Category picker must read the CANONICAL CoA
      // (catalogs.accounts) — the same table inline "+ Add new account/category" writes — not
      // mdata.qbo_accounts (mirror). Postable expense-type leaves only (VERIFY-6 / LST-F14).
      const expenseCategoriesRes = await client.query(
        `
          SELECT id,
                 qbo_account_id AS qbo_id,
                 account_name AS name,
                 account_type,
                 updated_at AS mirrored_at
          FROM catalogs.accounts
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
            AND is_postable = true
            AND account_type IN ('Expense', 'CostOfGoodsSold', 'OtherExpense')
          ORDER BY account_name ASC, id ASC
        `,
        [oc]
      );

      const itemsRes = await client.query(
        `
          -- LST-PICKER-02: canonical catalogs.items (the table the inline create writes), not the
          -- mdata.qbo_items MIRROR. qbo_synced_at stands in for the mirror's mirrored_at.
          SELECT id, qbo_item_id AS qbo_id, item_name AS name, item_type, unit_price_cents,
                 qbo_synced_at AS mirrored_at
          FROM catalogs.items
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
            AND (
              lower(trim(coalesce(item_type, ''))) IN ('inventory', 'service')
              OR lower(replace(trim(coalesce(item_type, '')), ' ', '')) = 'noninventory'
            )
          ORDER BY name ASC, id ASC
        `,
        [oc]
      );

      // LV-WO-COST-CONTEXT-SILENTLY-MISSING-SOURCES: every to_regclass false-branch MUST set a
      // response flag. Empty arrays mean "zero rows"; sources.*.status="unavailable" means the
      // catalog relation is not provisioned (distinct from empty).
      let parts: unknown[] = [];
      let partsStatus: WoCostSourceStatus = "unavailable";
      let partsRelation: string | null = null;
      const invParts = await client.query(`SELECT to_regclass('inventory.parts') IS NOT NULL AS ok`);
      if (invParts.rows[0]?.ok) {
        const pr = await client.query(
          `SELECT * FROM inventory.parts WHERE operating_company_id = $1::uuid ORDER BY updated_at DESC NULLS LAST, id ASC`,
          [oc]
        );
        parts = pr.rows;
        partsStatus = "available";
        partsRelation = "inventory.parts";
      } else {
        const mip = await client.query(`SELECT to_regclass('maintenance.parts_inventory') IS NOT NULL AS ok`);
        if (mip.rows[0]?.ok) {
          const pr = await client.query(
            `
              SELECT id, part_description, on_hand_qty, location, last_purchase_amount, operating_company_id, updated_at
              FROM maintenance.parts_inventory
              WHERE operating_company_id = $1::uuid
              ORDER BY updated_at DESC, id ASC
            `,
            [oc]
          );
          parts = pr.rows;
          partsStatus = "fallback";
          partsRelation = "maintenance.parts_inventory";
        } else {
          // CLS-LATCH: both relations absent — signal unavailable (not empty).
          partsStatus = "unavailable";
          partsRelation = null;
        }
      }

      let labor_rates: unknown[] = [];
      let laborStatus: WoCostSourceStatus = "unavailable";
      let laborRelation: string | null = null;
      const mlr = await client.query(`SELECT to_regclass('maintenance.labor_rates') IS NOT NULL AS ok`);
      if (mlr.rows[0]?.ok) {
        const lr = await client.query(
          `SELECT * FROM maintenance.labor_rates WHERE operating_company_id = $1::uuid ORDER BY rate_name ASC NULLS LAST, id ASC`,
          [oc]
        );
        labor_rates = lr.rows;
        laborStatus = "available";
        laborRelation = "maintenance.labor_rates";
      } else {
        const clr = await client.query(`SELECT to_regclass('catalogs.labor_rates') IS NOT NULL AS ok`);
        if (clr.rows[0]?.ok) {
          const lr = await client.query(
            `
              SELECT id, rate_code, rate_name, rate_per_hour, is_internal, is_active, operating_company_id
              FROM catalogs.labor_rates
              WHERE operating_company_id = $1::uuid AND is_active = true
              ORDER BY rate_name ASC, id ASC
            `,
            [oc]
          );
          labor_rates = lr.rows;
          laborStatus = "fallback";
          laborRelation = "catalogs.labor_rates";
        } else {
          // CLS-LATCH: both relations absent — signal unavailable (not empty).
          laborStatus = "unavailable";
          laborRelation = null;
        }
      }

      return {
        expense_categories: expenseCategoriesRes.rows,
        items: itemsRes.rows,
        parts,
        labor_rates,
        sources: {
          inventory_parts: { status: partsStatus, relation: partsRelation },
          labor_rates: { status: laborStatus, relation: laborRelation },
        },
      };
    });

    return payload;
  });
}
