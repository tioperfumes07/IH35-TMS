#!/usr/bin/env node
/**
 * P37 (37 OF 50) — Wave-A linkage ratchet for accounting invoices.
 *
 * THE COLUMN: an invoice must be able to say WHICH LOAD it bills and WHICH CUSTOMER owes it.
 * Without the load link there is no per-load margin — revenue floats free of the trip that earned it.
 *
 * THE GAP THIS LOCKS SHUT: accounting.invoices.source_load_id existed, the PATCH schema accepted it,
 * and the list query FILTERED on it — but CREATE could neither accept nor persist it. Invoicing a
 * load directly took two calls (create, then PATCH), and in between the invoice was orphan revenue.
 * It showed up as a BLOCKED GL POST rather than a wrong number, because invoice-linkage-guards.ts
 * refuses to post load revenue without the column — fail-closed, but still a hole in the write path.
 *
 * ★ customer_id needs no live assertion: accounting.invoices.customer_id is NOT NULL at the schema
 * level, so the database already guarantees it. Re-asserting it here would be theatre — a check that
 * cannot fail while the column definition stands. This guard therefore ratchets what is actually
 * losable: the LOAD link, and the entity scoping that keeps it honest.
 *
 * THREE INVARIANTS:
 *   A. The create body schema still ACCEPTS source_load_id.
 *   B. The create INSERT still BINDS source_load_id  — accept-then-drop is the exact bug being fixed,
 *      so accepting it is not enough; the column must reach the INSERT.
 *   C. The load is validated ENTITY-SCOPED. An unscoped lookup lets one entity's load be stamped onto
 *      another's revenue (CLS-JOIN-ENTITY-UNSCOPED) — an FK that is present and wrong, which is worse
 *      than absent.
 *
 * Static by design: it needs no database, so it runs in every CI context including the fresh-DB job.
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "3065-verify-invoice-create-stamps-source-load-id";
const ROUTES = path.join("apps", "backend", "src", "accounting", "invoices.routes.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(ROUTES)) {
  fail(`${ROUTES} not found — the invoice create path moved; re-point this guard rather than deleting it`);
}
const src = fs.readFileSync(ROUTES, "utf8");

// ── A · the create body schema accepts the column ────────────────────────────────────────────────
// Scoped to createBodySchema specifically. patchBodySchema has ALWAYS accepted source_load_id, so a
// file-wide grep would pass on the patch schema alone and prove nothing about create — the precise
// false-green this guard exists to prevent.
const createSchema = src.match(/const createBodySchema = z\.object\(\{[\s\S]*?\n\}\);/);
if (!createSchema) fail("createBodySchema not found in invoices.routes.ts — cannot verify the create contract");
// ★ MATCH THE DECLARATION, NEVER THE PROSE. The first version tested /\bsource_load_id\b/ against the
// raw block and was INERT: the explanatory comment above the field mentions source_load_id several
// times, so deleting the actual field still matched the comment and the guard reported PASS. Caught by
// mutation-testing — the mutation that should have failed did not. Comments are stripped and the FIELD
// SHAPE (`source_load_id: z.`) is required, so only a real declaration satisfies it.
const createSchemaCode = createSchema[0]
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
if (!/\bsource_load_id\s*:\s*z\./.test(createSchemaCode)) {
  fail("createBodySchema no longer accepts source_load_id — invoicing a load again needs a second PATCH call, leaving orphan revenue in between (P37)");
}

// ── B · the create INSERT binds the column ───────────────────────────────────────────────────────
const insert = src.match(/INSERT INTO accounting\.invoices\s*\(([\s\S]*?)\)\s*VALUES/);
if (!insert) fail("INSERT INTO accounting.invoices not found — the create path moved");
if (!/\bsource_load_id\b/.test(insert[1])) {
  fail("the accounting.invoices INSERT no longer binds source_load_id — the API would ACCEPT the load id and silently DROP it, which is precisely the P37 defect");
}

// ── C · the load is validated entity-scoped ──────────────────────────────────────────────────────
// The check must pin operating_company_id. Matching only "FROM mdata.loads" would accept an unscoped
// lookup, i.e. a guard that blesses the cross-entity leak it is meant to forbid.
const scopedLoadCheck = /FROM mdata\.loads\s+WHERE\s+id\s*=\s*\$1::uuid\s+AND\s+operating_company_id\s*=\s*\$2::uuid/.test(src);
if (!scopedLoadCheck) {
  fail("the create route no longer validates source_load_id against mdata.loads WITH operating_company_id — an unscoped load FK lets one entity's load be stamped onto another's revenue (CLS-JOIN-ENTITY-UNSCOPED)");
}

console.log(`[${LABEL}] PASS — invoice create accepts, entity-scopes and persists source_load_id (customer_id is NOT NULL at the schema level, so the DB already guarantees it)`);
