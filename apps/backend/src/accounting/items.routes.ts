import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const categoriesQuerySchema = companyQuerySchema.extend({
  type: z.enum(["expense", "all"]).default("expense"),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const itemsQuerySchema = companyQuerySchema.extend({
  kind: z.enum(["service", "inventory", "labor", "all"]).default("service"),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety", "Mechanic"].includes(role);
}

const EXPENSE_ACCOUNT_TYPES = ["Expense", "Cost of Goods Sold", "Other Expense"];

export async function registerAccountingCatalogLookupRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/categories", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = categoriesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: oc, type, search, limit } = parsed.data;

    const rows = await withCompanyScope(user.uuid, oc, async (client) => {
      const values: unknown[] = [oc];
      // LST-PICKER-02 — read the CANONICAL GL ledger, catalogs.accounts.
      //
      // This endpoint returns expense CATEGORIES, and a category IS a general-ledger account. It was
      // reading mdata.qbo_accounts — the read-only QBO MIRROR — while the comment that used to sit
      // here claimed it read canonical. Read and write disagreed, and the comment was the lie.
      //
      // The audit instructed repointing to catalogs.items. That would have been an ACCOUNTING DEFECT:
      // catalogs.items is products and services (item_type), catalogs.accounts is the posting ledger
      // (account_type / account_number / is_postable). Pointing a category picker at items would let
      // an expense be booked against a product record instead of a GL account — a chart-of-accounts
      // integrity break an auditor would find. Verified on prod before changing anything.
      //
      // Column mapping vs the mirror: account_name->name, account_number->account_number (the mirror
      // used full_qualified_name), deactivated_at IS NULL replaces the mirror's `active` flag.
      // is_postable is respected because a non-postable (header/parent) account must never be
      // offered as somewhere to book an expense.
      // The entity predicate is written LITERALLY into the SQL below rather than pushed onto this
      // array. Two reasons, and the second is why it changed: an array element can be reordered or
      // removed by a later edit without anything noticing, and verify-mdata-entity-scope cannot see a
      // predicate that only exists at runtime — it reads the SQL. Entity scoping on a money table
      // should be structural, not a list item.
      const filters = ["deactivated_at IS NULL", "coalesce(is_postable, true) = true"];
      if (type === "expense") {
        values.push(EXPENSE_ACCOUNT_TYPES);
        filters.push(`coalesce(account_type, '') = ANY($${values.length}::text[])`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(account_name ILIKE $${idx} OR coalesce(account_number, '') ILIKE $${idx})`);
      }
      values.push(limit);
      const res = await client.query(
        `
          SELECT
            id,
            qbo_account_id AS qbo_id,
            account_name   AS name,
            account_type,
            account_number
          FROM catalogs.accounts
          WHERE operating_company_id = $1::uuid
            AND ${filters.join(" AND ")}
          ORDER BY account_name ASC
          LIMIT $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { categories: rows };
  });

  app.get("/api/v1/accounting/items-for-wo", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = itemsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: oc, kind, search, limit } = parsed.data;

    const rows = await withCompanyScope(user.uuid, oc, async (client) => {
      const values: unknown[] = [oc];
      // LIVE INCIDENT FIX (LST-PICKER-02, 2026-07-25): this read was repointed from the QBO mirror
      // mdata.qbo_items to canonical catalogs.items but kept the mirror's `active = true` predicate.
      // catalogs.items has NO `active` and no `is_active` column — 0010_catalogs_init.sql models
      // lifecycle as `deactivated_at timestamptz` and no later migration adds one (verified against
      // db/migrations AND live prod under lucia). Postgres raised 42703 undefined_column, so this
      // endpoint returned 500 on EVERY call and the item picker was dead in production.
      const filters = ["operating_company_id = $1::uuid", "deactivated_at IS NULL"];
      if (kind === "service") {
        filters.push(`lower(trim(coalesce(item_type, ''))) IN ('service', 'noninventory')`);
      } else if (kind === "inventory") {
        filters.push(`lower(trim(coalesce(item_type, ''))) = 'inventory'`);
      } else if (kind === "labor") {
        filters.push(`lower(trim(coalesce(item_name, ''))) LIKE '%labor%'`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(item_name ILIKE $${idx} OR coalesce(item_code, '') ILIKE $${idx})`);
      }
      values.push(limit);
      const res = await client.query(
        `
          SELECT id, qbo_item_id AS qbo_id, item_name AS name, item_type, unit_price_cents
          FROM catalogs.items
          WHERE ${filters.join(" AND ")}
          ORDER BY item_name ASC
          LIMIT $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { items: rows };
  });
}
