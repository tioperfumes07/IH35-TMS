import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

const querySchema = companyQuerySchema;

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety", "Mechanic"].includes(role);
}

export async function registerWoCostContextRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/wo-cost-context", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const oc = parsed.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, oc, async (client) => {
      const expenseCategoriesRes = await client.query(
        `
          SELECT id, qbo_id, name, account_type, mirrored_at
          FROM mdata.qbo_accounts
          WHERE operating_company_id = $1::uuid
            AND active = true
            AND coalesce(account_type, '') IN ('Expense', 'Cost of Goods Sold', 'Other Expense')
          ORDER BY name ASC
          LIMIT 500
        `,
        [oc]
      );

      const itemsRes = await client.query(
        `
          SELECT id, qbo_id, name, item_type, unit_price_cents, mirrored_at
          FROM mdata.qbo_items
          WHERE operating_company_id = $1::uuid
            AND active = true
            AND (
              lower(trim(coalesce(item_type, ''))) IN ('inventory', 'service')
              OR lower(replace(trim(coalesce(item_type, '')), ' ', '')) = 'noninventory'
            )
          ORDER BY name ASC
          LIMIT 500
        `,
        [oc]
      );

      let parts: unknown[] = [];
      const invParts = await client.query(`SELECT to_regclass('inventory.parts') IS NOT NULL AS ok`);
      if (invParts.rows[0]?.ok) {
        const pr = await client.query(
          `SELECT * FROM inventory.parts WHERE operating_company_id = $1::uuid ORDER BY updated_at DESC NULLS LAST LIMIT 500`,
          [oc]
        );
        parts = pr.rows;
      } else {
        const mip = await client.query(`SELECT to_regclass('maintenance.parts_inventory') IS NOT NULL AS ok`);
        if (mip.rows[0]?.ok) {
          const pr = await client.query(
            `
              SELECT id, part_description, on_hand_qty, location, last_purchase_amount, operating_company_id, updated_at
              FROM maintenance.parts_inventory
              WHERE operating_company_id = $1::uuid
              ORDER BY updated_at DESC
              LIMIT 500
            `,
            [oc]
          );
          parts = pr.rows;
        }
      }

      let labor_rates: unknown[] = [];
      const mlr = await client.query(`SELECT to_regclass('maintenance.labor_rates') IS NOT NULL AS ok`);
      if (mlr.rows[0]?.ok) {
        const lr = await client.query(
          `SELECT * FROM maintenance.labor_rates WHERE operating_company_id = $1::uuid ORDER BY rate_name ASC NULLS LAST LIMIT 200`,
          [oc]
        );
        labor_rates = lr.rows;
      } else {
        const clr = await client.query(`SELECT to_regclass('catalogs.labor_rates') IS NOT NULL AS ok`);
        if (clr.rows[0]?.ok) {
          const lr = await client.query(
            `
              SELECT id, rate_code, rate_name, rate_per_hour, is_internal, is_active, operating_company_id
              FROM catalogs.labor_rates
              WHERE operating_company_id = $1::uuid AND is_active = true
              ORDER BY rate_name ASC
              LIMIT 200
            `,
            [oc]
          );
          labor_rates = lr.rows;
        }
      }

      return {
        expense_categories: expenseCategoriesRes.rows,
        items: itemsRes.rows,
        parts,
        labor_rates,
      };
    });

    return payload;
  });
}
