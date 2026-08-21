#!/usr/bin/env node
/**
 * ACCT-F5704 — `POST /api/v1/maintenance/parts-inventory/purchases`' stock-upsert INSERT specified an
 * ON CONFLICT (operating_company_id, part_number) WHERE part_number IS NOT NULL AND part_number <> ''
 * target, but the live unique index it must match to be inferable as the arbiter
 * (uq_parts_inventory_company_part_number, 202612560000 section 2) wraps part_number in btrim():
 * WHERE part_number IS NOT NULL AND btrim(part_number) <> ''. Postgres requires the ON CONFLICT
 * target's predicate to match an existing index's predicate EXACTLY (structurally) to infer it as
 * the arbiter — a mismatched predicate is not "close enough," it's simply unmatched, so this route
 * 500'd with 42P10 ("no unique or exclusion constraint matching the ON CONFLICT specification") on
 * EVERY call with a non-null part_number, confirmed live on prod via a rolled-back EXPLAIN.
 *
 * FAIL: the route's ON CONFLICT predicate diverges from the live index's btrim(part_number) shape.
 * PASS: they match.
 *
 * Self-test: node scripts/verify-parts-inventory-purchase-on-conflict-matches-index.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-parts-inventory-purchase-on-conflict-matches-index";
const ROUTE = "apps/backend/src/maintenance/parts-inventory.routes.ts";
const INDEX_MIGRATION = "db/migrations/202612560000_inv_purchase_ledger_sor_stock_upsert.sql";

const ON_CONFLICT_PREDICATE_RE = /ON CONFLICT \(operating_company_id, part_number\) WHERE part_number IS NOT NULL AND btrim\(part_number\) <> ''/;
const INDEX_PREDICATE_RE = /WHERE part_number IS NOT NULL AND btrim\(part_number\) <> ''/;

function failures(sources) {
  const out = [];
  const route = sources[ROUTE];
  const migration = sources[INDEX_MIGRATION];

  if (!ON_CONFLICT_PREDICATE_RE.test(route)) {
    out.push(`${ROUTE}: ON CONFLICT predicate must read "WHERE part_number IS NOT NULL AND btrim(part_number) <> ''" (matching the live unique index exactly) — a plain "part_number <> ''" predicate cannot be inferred as the arbiter and 500s with 42P10 on every real call`);
  }
  if (migration && !INDEX_PREDICATE_RE.test(migration)) {
    out.push(`${INDEX_MIGRATION}: expected index-creation predicate not found — this guard's own assumption about the live index shape may be stale, re-verify against prod before trusting a PASS here`);
  }

  return out;
}

const live = {
  [ROUTE]: fs.readFileSync(ROUTE, "utf8"),
  [INDEX_MIGRATION]: fs.existsSync(INDEX_MIGRATION) ? fs.readFileSync(INDEX_MIGRATION, "utf8") : "",
};

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: "ON CONFLICT predicate reverted to the mismatched (no-btrim) shape",
      file: ROUTE,
      mutate: (text) =>
        text.replace(
          "ON CONFLICT (operating_company_id, part_number) WHERE part_number IS NOT NULL AND btrim(part_number) <> ''",
          "ON CONFLICT (operating_company_id, part_number) WHERE part_number IS NOT NULL AND part_number <> ''"
        ),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — the parts-inventory purchase stock-upsert ON CONFLICT predicate matches the live unique index exactly (btrim-wrapped), inferable as the arbiter`);
