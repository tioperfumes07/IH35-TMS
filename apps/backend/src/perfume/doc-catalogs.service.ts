/**
 * PERFUME M20 (LEAD ROUND L.32): catalogs on documents — payment terms (catalogs.payment_terms, the engine's own list that
 * createExpandedInvoice reads), shipping method (perfume catalog kind 'shipping_method') and sales-tax code
 * (catalogs.tax_codes) picked on a quote, sales order or purchase order; the invoice and the bill take their due date from
 * the picked terms. Every pick is checked against the live catalog (ScentsX's own, active) — a free-typed value is refused.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx } from "../scentsx/links.service.js";

type Q = Pick<pg.PoolClient, "query">;
export type DocTable = "quotes" | "sales_orders" | "purchase_orders";

export const docCatalogFields = {
  payment_terms_id: z.string().uuid().nullable().optional(),
  shipping_method: z.string().trim().max(200).nullable().optional(),
  tax_code_id: z.string().uuid().nullable().optional(),
};
export type DocCatalogPick = { payment_terms_id?: string | null; shipping_method?: string | null; tax_code_id?: string | null };

export class DocCatalogInvalid extends Error {}

export type DocCatalogs = {
  terms: Array<{ id: string; name: string; days: number }>;
  shipping_methods: string[];
  tax_codes: Array<{ id: string; code: string; name: string; rate_pct: number | null }>;
  payment_methods: Array<{ code: string; name: string }>;
};

/** The pick lists every document form shows (ScentsX's active rows, in their sort order). */
export async function docCatalogs(c: Q): Promise<DocCatalogs> {
  await scopeToScentsx(c);
  const terms = await c.query<{ id: string; name: string; days: number }>(
    `SELECT id::text, terms_name AS name, days_until_due AS days FROM catalogs.payment_terms
      WHERE operating_company_id = scentsx.company_id() AND deactivated_at IS NULL ORDER BY days_until_due, terms_name`);
  const ship = await c.query<{ value: string }>(
    `SELECT value FROM perfume.catalog_values WHERE kind = 'shipping_method' AND archived_at IS NULL ORDER BY sort, value`);
  const tax = await c.query<{ id: string; code: string; name: string; rate_pct: string | null }>(
    `SELECT id::text, code, display_name AS name, metadata->>'rate_pct' AS rate_pct FROM catalogs.tax_codes
      WHERE operating_company_id = scentsx.company_id() AND is_active ORDER BY sort_order, code`);
  const pm = await c.query<{ code: string; name: string }>(
    `SELECT code, display_name AS name FROM catalogs.payment_methods
      WHERE operating_company_id = scentsx.company_id() AND is_active AND voided_at IS NULL ORDER BY sort_order, code`);
  return {
    terms: terms.rows, shipping_methods: ship.rows.map((r) => r.value),
    tax_codes: tax.rows.map((r) => ({ ...r, rate_pct: r.rate_pct == null ? null : Number(r.rate_pct) })), payment_methods: pm.rows,
  };
}

/**
 * Writes the picked terms / shipping method / tax code on one document after checking each against its catalog. `terms`
 * (the printed text) follows the picked terms' name. A field left undefined is left as it is; null clears it.
 * Returns the names of the fields it changed (for the document's history row).
 */
export async function applyDocCatalogs(c: Q, table: DocTable, id: string, x: DocCatalogPick): Promise<string[]> {
  const sets: string[] = [];
  const args: unknown[] = [id];
  const changed: string[] = [];
  if (x.payment_terms_id === undefined && x.shipping_method === undefined && x.tax_code_id === undefined) return [];
  await scopeToScentsx(c);
  if (x.payment_terms_id !== undefined) {
    if (x.payment_terms_id === null) {
      sets.push("payment_terms_id = NULL", "terms = NULL");
    } else {
      const t = (await c.query<{ name: string }>(
        `SELECT terms_name AS name FROM catalogs.payment_terms WHERE id = $1::uuid AND operating_company_id = scentsx.company_id() AND deactivated_at IS NULL`,
        [x.payment_terms_id])).rows[0];
      if (!t) throw new DocCatalogInvalid("Those payment terms are not on the ScentsX terms list.");
      args.push(x.payment_terms_id, t.name);
      sets.push(`payment_terms_id = $${args.length - 1}::uuid`, `terms = $${args.length}`);
    }
    changed.push("payment_terms");
  }
  if (x.shipping_method === "") x = { ...x, shipping_method: null };
  if (x.shipping_method !== undefined) {
    if (x.shipping_method !== null) {
      const ok = await c.query(`SELECT 1 FROM perfume.catalog_values WHERE kind = 'shipping_method' AND archived_at IS NULL AND value = $1`, [x.shipping_method]);
      if (!ok.rowCount) throw new DocCatalogInvalid(`"${x.shipping_method}" is not on the shipping methods list — add it on Catalogs first.`);
    }
    args.push(x.shipping_method);
    sets.push(`shipping_method = $${args.length}`);
    changed.push("shipping_method");
  }
  if (x.tax_code_id !== undefined) {
    if (table === "purchase_orders") throw new DocCatalogInvalid("A purchase order carries no sales-tax code.");
    if (x.tax_code_id !== null) {
      const ok = await c.query(`SELECT 1 FROM catalogs.tax_codes WHERE id = $1::uuid AND operating_company_id = scentsx.company_id() AND is_active`, [x.tax_code_id]);
      if (!ok.rowCount) throw new DocCatalogInvalid("That sales-tax code is not on the ScentsX list.");
    }
    args.push(x.tax_code_id);
    sets.push(`tax_code_id = $${args.length}::uuid`);
    changed.push("tax_code");
  }
  if (!sets.length) return [];
  await c.query(`UPDATE perfume.${table} SET ${sets.join(", ")}, updated_at = now() WHERE id = $1::uuid`, args);
  return changed;
}

/** The SELECT columns every document header adds (alias `d`). */
export const docCatalogColumns = (alias: string, withTax: boolean) =>
  `${alias}.payment_terms_id::text AS payment_terms_id, ${alias}.shipping_method,
   (SELECT pt.days_until_due FROM catalogs.payment_terms pt WHERE pt.id = ${alias}.payment_terms_id) AS terms_days` +
  (withTax ? `, ${alias}.tax_code_id::text AS tax_code_id, (SELECT t.display_name FROM catalogs.tax_codes t WHERE t.id = ${alias}.tax_code_id) AS tax_code_name` : "");

/** Due date = document date + the picked terms' days; no terms picked → null (the caller keeps its own default). */
export async function dueFromPickedTerms(c: Q, termsId: string | null, fromDate: string): Promise<string | null> {
  if (!termsId) return null;
  await scopeToScentsx(c);
  const d = (await c.query<{ due: string }>(
    `SELECT ($2::date + days_until_due)::text AS due FROM catalogs.payment_terms WHERE id = $1::uuid`, [termsId, fromDate])).rows[0];
  return d?.due ?? null;
}
