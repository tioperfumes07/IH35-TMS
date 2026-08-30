#!/usr/bin/env node
/**
 * ACCT-F5756 — INVENTORY-PARTS-ASSIGNMENT-PHYSICAL-DELETE: `DELETE /api/v1/maintenance/
 * parts-invoice-links/:id` used to run `DELETE FROM maintenance.parts_invoice_links`, physically
 * destroying the append-only WO parts-consumption record with no void/reversal metadata, and never
 * restoring `parts_inventory.on_hand_qty` (the stock the create path decrements by qty_used). Fixed
 * by adding voided_at/void_reason/voided_by_user_id (migration 202612980000) and changing the route
 * to an atomic void that restores stock exactly once.
 *
 * INVARIANT (static — no database):
 *   1. No literal `DELETE FROM maintenance.parts_invoice_links` remains in the routes file.
 *   2. The void path sets voided_at/void_reason/voided_by_user_id and stays scoped to
 *      voided_at IS NULL (never double-voids).
 *   3. The void path restores parts_inventory.on_hand_qty by qty_used when parts_inventory_id is set.
 *   4. Every active read of maintenance.parts_invoice_links (the list endpoint, the unit-history
 *      endpoint, and wo-cost-validation.ts's cost rollup) excludes voided rows.
 *
 * Self-test: node scripts/verify-parts-invoice-links-void-not-delete.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/maintenance/parts-invoice-links.routes.ts";
const COST_VALIDATION = "apps/backend/src/maintenance/wo-cost-validation.ts";
const LABEL = "verify-parts-invoice-links-void-not-delete";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkVoidNotDelete(routesSrc, costValidationSrc) {
  const problems = [];

  if (/DELETE FROM maintenance\.parts_invoice_links/.test(routesSrc)) {
    problems.push(`${ROUTES}: still contains a literal DELETE FROM maintenance.parts_invoice_links — physical delete not removed`);
  }
  if (!/SET\s+voided_at\s*=\s*now\(\),\s*void_reason\s*=/.test(routesSrc)) {
    problems.push(`${ROUTES}: void UPDATE no longer sets voided_at/void_reason`);
  }
  if (!/voided_by_user_id\s*=\s*\$4::uuid/.test(routesSrc)) {
    problems.push(`${ROUTES}: void UPDATE no longer stamps voided_by_user_id`);
  }
  if (!/AND voided_at IS NULL\s*\n\s*RETURNING id, work_order_id, parts_inventory_id, qty_used/.test(routesSrc)) {
    problems.push(`${ROUTES}: void UPDATE no longer scopes to voided_at IS NULL (would allow double-voiding)`);
  }
  if (!/on_hand_qty\s*=\s*COALESCE\(on_hand_qty,\s*0\)\s*\+\s*\$2/.test(routesSrc)) {
    problems.push(`${ROUTES}: void path no longer restores parts_inventory.on_hand_qty (+qty_used)`);
  }

  const activeReadFilterCount = (routesSrc.match(/pil\.voided_at IS NULL/g) || []).length;
  if (activeReadFilterCount < 2) {
    problems.push(`${ROUTES}: expected 2 active-read call sites (list + unit-history) to filter pil.voided_at IS NULL, found ${activeReadFilterCount}`);
  }

  const partsCostQuery = costValidationSrc.match(
    /FROM maintenance\.parts_invoice_links\b[\s\S]{0,500}?WHERE work_order_id = \$1::uuid[\s\S]{0,500}?(?=\n\s*`,|$)/
  )?.[0];
  if (!partsCostQuery || !/AND operating_company_id = \$2::uuid/.test(partsCostQuery)) {
    problems.push(`${COST_VALIDATION}: cost rollup no longer scopes parts_invoice_links to operating_company_id`);
  }
  if (!partsCostQuery || !/AND voided_at IS NULL/.test(partsCostQuery)) {
    problems.push(`${COST_VALIDATION}: cost rollup no longer excludes voided_at rows — a voided part would still count toward WO cost`);
  }

  return problems;
}

function selftest() {
  const goodRoutes = `
    const voided = await client.query(
      \`
        UPDATE maintenance.parts_invoice_links
        SET voided_at = now(), void_reason = $3, voided_by_user_id = $4::uuid
        WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL
        RETURNING id, work_order_id, parts_inventory_id, qty_used
      \`
    );
    if (row.parts_inventory_id) {
      await client.query(
        \`
          UPDATE maintenance.parts_inventory
          SET on_hand_qty = COALESCE(on_hand_qty, 0) + $2, updated_at = now()
          WHERE id = $1 AND operating_company_id = $3::uuid
        \`
      );
    }
    WHERE \${filters.join(" AND ")}
      AND pil.voided_at IS NULL
    ORDER BY pil.created_at DESC

    WHERE pil.operating_company_id = $1::uuid
      AND wo.unit_id = $2
      AND pil.voided_at IS NULL
    ORDER BY pil.created_at DESC
  `;
  const goodCostValidation = `
    SELECT
      COUNT(*)::int AS cnt,
      COALESCE(SUM(vendor_invoice_amount::numeric * GREATEST(qty_used, 1)), 0)::numeric AS total
    FROM maintenance.parts_invoice_links
    WHERE work_order_id = $1::uuid
      AND operating_company_id = $2::uuid
      AND voided_at IS NULL
  `;
  const goodProblems = checkVoidNotDelete(goodRoutes, goodCostValidation);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const regressedDelete = goodRoutes + "\n    DELETE FROM maintenance.parts_invoice_links WHERE id = $1;";
  const mutations = [
    { routes: regressedDelete, cost: goodCostValidation },
    { routes: goodRoutes.replace("SET voided_at = now(), void_reason = $3, voided_by_user_id = $4::uuid", "SET foo = 1"), cost: goodCostValidation },
    { routes: goodRoutes.replace("voided_by_user_id = $4::uuid", ""), cost: goodCostValidation },
    { routes: goodRoutes.replace("AND voided_at IS NULL\n        RETURNING id, work_order_id, parts_inventory_id, qty_used", "RETURNING id, work_order_id, parts_inventory_id, qty_used"), cost: goodCostValidation },
    { routes: goodRoutes.replace("on_hand_qty = COALESCE(on_hand_qty, 0) + $2", "on_hand_qty = on_hand_qty"), cost: goodCostValidation },
    { routes: goodRoutes.replace(/AND pil\.voided_at IS NULL\n/g, ""), cost: goodCostValidation },
    { routes: goodRoutes, cost: goodCostValidation.replace("AND operating_company_id = $2::uuid\n", "") },
    { routes: goodRoutes, cost: goodCostValidation.replace("AND voided_at IS NULL\n", "") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkVoidNotDelete(mutated.routes, mutated.cost).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const routesSrc = read(ROUTES);
const costValidationSrc = read(COST_VALIDATION);
const failures = checkVoidNotDelete(routesSrc, costValidationSrc);
if (failures.length) {
  console.error(`[${LABEL}] FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — parts-invoice-links DELETE is an atomic void (voided_at/void_reason/voided_by_user_id + stock restore), every active read excludes voided rows`);
