#!/usr/bin/env node
// verify-catalogs-items-classes-entity-scope.mjs — entity-independence regression guard for
// catalogs.items and catalogs.classes (MULTI-ENTITY-SEPARATION intent — sibling of
// verify-catalogs-accounts-entity-scope.mjs, which only covers catalogs.accounts).
//
// Once AF-2 (items) / AF-3 (classes) land, these tables MUST stay per-entity: composite UNIQUEs on
// (operating_company_id, <natural key>), entity-scoped RLS policies filtering operating_company_id,
// operating_company_id NOT NULL, and same-entity composite FKs — and NO later migration may
// re-introduce a GLOBAL unique on item_name/item_code/qbo_item_id or class_name/class_code/qbo_class_id
// alone (a bare global unique is exactly the cross-entity leak these blocks remove).
//
// Static (no DB): asserts the migration set encodes per-entity scope and never regresses it. Each table
// passes as a no-op until its per-entity migration is present (so it does not fail pre-AF-2/AF-3 main).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "db/migrations");
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const texts = new Map(files.map((f) => [f, fs.readFileSync(path.join(MIG, f), "utf8")]));
const blob = [...texts.values()].join("\n");

const errs = [];

// ─── catalogs.items (AF-2) ────────────────────────────────────────────────────────────────────────
const itemsPresent =
  /uq_items_company_item_name/.test(blob) && /uq_items_company_qbo_item_id/.test(blob);
if (!itemsPresent) {
  console.log("[catalogs-items-classes-entity-scope] SKIP items — AF-2 per-entity migration not present yet.");
} else {
  if (!/uq_items_company_item_name[\s\S]{0,120}operating_company_id,\s*item_name/i.test(blob))
    errs.push("items: missing composite UNIQUE (operating_company_id, item_name)");
  if (!/uq_items_company_qbo_item_id[\s\S]{0,160}operating_company_id,\s*qbo_item_id/i.test(blob))
    errs.push("items: missing composite UNIQUE (operating_company_id, qbo_item_id)");
  if (!/ALTER TABLE catalogs\.items ALTER COLUMN operating_company_id SET NOT NULL/i.test(blob))
    errs.push("items: operating_company_id is never SET NOT NULL");
  if (!/ALTER TABLE catalogs\.items ENABLE ROW LEVEL SECURITY/i.test(blob))
    errs.push("items: catalogs.items RLS not enabled");
  if (!/POLICY[^\n]*items_entity[\s\S]{0,220}operating_company_id/i.test(blob))
    errs.push("items: no entity-scoped RLS policy filtering operating_company_id (items_entity_*)");
  if (!/items_income_account_same_entity_fkey/.test(blob) ||
      !/items_expense_account_same_entity_fkey/.test(blob))
    errs.push("items: missing same-entity composite FK to catalogs.accounts (income/expense)");
}

// ─── catalogs.classes (AF-3) ──────────────────────────────────────────────────────────────────────
const classesPresent = /uq_classes_company_class_name/.test(blob);
if (!classesPresent) {
  console.log("[catalogs-items-classes-entity-scope] SKIP classes — AF-3 per-entity migration not present yet.");
} else {
  if (!/uq_classes_company_class_name[\s\S]{0,120}operating_company_id,\s*class_name/i.test(blob))
    errs.push("classes: missing composite UNIQUE (operating_company_id, class_name)");
  if (!/uq_classes_company_qbo_class_id[\s\S]{0,160}operating_company_id,\s*qbo_class_id/i.test(blob))
    errs.push("classes: missing composite UNIQUE (operating_company_id, qbo_class_id)");
  if (!/ALTER TABLE catalogs\.classes ALTER COLUMN operating_company_id SET NOT NULL/i.test(blob))
    errs.push("classes: operating_company_id is never SET NOT NULL");
  if (!/ALTER TABLE catalogs\.classes ENABLE ROW LEVEL SECURITY/i.test(blob))
    errs.push("classes: catalogs.classes RLS not enabled");
  if (!/POLICY[^\n]*classes_entity[\s\S]{0,220}operating_company_id/i.test(blob))
    errs.push("classes: no entity-scoped RLS policy filtering operating_company_id (classes_entity_*)");
}

// ─── regression: no migration re-adds a GLOBAL single-column unique on the natural keys ─────────────
// (a bare global unique on item_name/qbo_item_id or class_name/qbo_class_id is the leak AF-2/AF-3 remove).
const globalUnique = (col) =>
  new RegExp(`ADD CONSTRAINT[^\\n;]*UNIQUE\\s*\\(\\s*${col}\\s*\\)`, "i");
const globalUniqueIdx = (col) =>
  new RegExp(`CREATE UNIQUE INDEX[^\\n;]*\\(\\s*${col}\\s*\\)\\s*;`, "i");
for (const [f, t] of texts) {
  for (const col of ["item_name", "item_code", "qbo_item_id", "class_name", "class_code", "qbo_class_id"]) {
    if (globalUnique(col).test(t) || globalUniqueIdx(col).test(t))
      errs.push(`${f}: re-introduces a GLOBAL unique on ${col} (entity-scope regression)`);
  }
}

if (errs.length === 0) {
  console.log("[catalogs-items-classes-entity-scope] PASS — catalogs.items/classes are per-entity (composite uniques + entity RLS + NOT NULL + same-entity FKs); no global-unique regression.");
  process.exit(0);
}
console.error("\nCATALOGS-ITEMS-CLASSES-ENTITY-SCOPE GUARD FAILED");
console.error("=".repeat(64));
for (const e of errs) console.error("  " + e);
console.error("=".repeat(64));
process.exit(1);
