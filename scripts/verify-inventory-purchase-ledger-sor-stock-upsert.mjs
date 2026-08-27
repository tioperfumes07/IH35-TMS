#!/usr/bin/env node
/**
 * verify-inventory-purchase-ledger-sor-stock-upsert — INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT
 * (owner-approved 2026-08-15, docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md).
 *
 * Asserts the shipped contract end to end:
 *   1. Migration creates append-only maintenance.parts_purchases (WORM: no DELETE grant) and a
 *      real unique (operating_company_id, part_number) identity on parts_inventory.
 *   2. Migration additively re-keys the GL poster's idempotency latch off the purchase EVENT
 *      (parts_purchase_id), not the mutable stock row — otherwise the stock-upsert fix above
 *      would silently cap GL posting at one purchase per part forever once the held migration
 *      202609030000 is applied and the flag flips.
 *   3. The POST route does the stock upsert (ON CONFLICT ... DO UPDATE) and the purchase-event
 *      INSERT on the SAME connection inside one withCompany(...) callback (atomic — either both
 *      land or neither does), and passes parts_purchase_id to the poster.
 *   4. A void route exists, is append-only (voided_at/voided_by/void_reason, never DELETE), and
 *      symmetrically decrements the same stock row it incremented.
 *   5. The frontend Purchase History page reads the real SoR (verify-inventory-purchases-honesty
 *      / verify-inventory-purchase-hold-connectivity already cover that surface; this guard does
 *      not duplicate those checks).
 *
 * Usage:
 *   node scripts/verify-inventory-purchase-ledger-sor-stock-upsert.mjs            # scan
 *   node scripts/verify-inventory-purchase-ledger-sor-stock-upsert.mjs --selftest # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inventory-purchase-ledger-sor-stock-upsert";
const MIGRATION = "db/migrations/202612560000_inv_purchase_ledger_sor_stock_upsert.sql";
const ROUTES = "apps/backend/src/maintenance/parts-inventory.routes.ts";
const POSTER = "apps/backend/src/accounting/parts-inventory-posting/poster.service.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const migration = readRel(root, MIGRATION, overrides);
  const routes = readRel(root, ROUTES, overrides);
  const poster = readRel(root, POSTER, overrides);

  if (!migration) {
    problems.push(`missing ${MIGRATION}`);
  } else {
    if (!/CREATE TABLE IF NOT EXISTS maintenance\.parts_purchases/.test(migration)) {
      problems.push(`${MIGRATION}: must create maintenance.parts_purchases`);
    }
    if (!/REVOKE DELETE ON maintenance\.parts_purchases FROM ih35_app/.test(migration)) {
      problems.push(`${MIGRATION}: must REVOKE DELETE on parts_purchases (WORM/append-only)`);
    }
    if (!/uq_parts_inventory_company_part_number/.test(migration)) {
      problems.push(`${MIGRATION}: must add the real (operating_company_id, part_number) unique identity`);
    }
    if (!/parts_purchase_id uuid REFERENCES maintenance\.parts_purchases\(id\)/.test(migration)) {
      problems.push(`${MIGRATION}: must additively key the GL poster latch off parts_purchase_id`);
    }
    if (!/FORCE ROW LEVEL SECURITY/.test(migration)) {
      problems.push(`${MIGRATION}: parts_purchases must FORCE ROW LEVEL SECURITY`);
    }
  }

  if (!routes) {
    problems.push(`missing ${ROUTES}`);
  } else {
    if (!/ON CONFLICT \(operating_company_id, part_number\)[\s\S]{0,120}DO UPDATE SET/.test(routes)) {
      problems.push(`${ROUTES}: POST /purchases must upsert stock via ON CONFLICT (operating_company_id, part_number) DO UPDATE, not a bare INSERT`);
    }
    if (!/INSERT INTO maintenance\.parts_purchases/.test(routes)) {
      problems.push(`${ROUTES}: POST /purchases must insert the append-only purchase event`);
    }
    // Atomicity: both writes must happen inside the SAME withCompany(...) callback, not two
    // separate calls (which would each open their own transaction and could partially commit).
    const postHandler = routes.match(/app\.post\("\/api\/v1\/maintenance\/parts-inventory\/purchases",[\s\S]*?\n  \}\);/);
    if (!postHandler) {
      problems.push(`${ROUTES}: could not locate the POST /purchases handler to check atomicity`);
    } else {
      const withCompanyCalls = postHandler[0].match(/withCompany\(/g) ?? [];
      if (withCompanyCalls.length !== 1) {
        problems.push(`${ROUTES}: POST /purchases must do the stock upsert AND purchase-event insert inside exactly one withCompany(...) call (atomic), found ${withCompanyCalls.length}`);
      }
      if (!/validatePartsPurchaseLinks\([\s\S]{0,260}body\.data\.vendor_id[\s\S]{0,120}body\.data\.work_order_id/.test(postHandler[0])) {
        problems.push(`${ROUTES}: POST /purchases must validate vendor and work-order links before stock mutation`);
      }
      if (!/if \(!linksValid\) return null;[\s\S]{0,300}INSERT INTO maintenance\.parts_inventory/.test(postHandler[0])) {
        problems.push(`${ROUTES}: invalid purchase links must stop before the stock upsert`);
      }
    }
    if (!/FROM mdata\.vendors v[\s\S]{0,180}v\.operating_company_id = \$1::uuid[\s\S]{0,120}v\.deactivated_at IS NULL/.test(routes)
        || !/FROM maintenance\.work_orders wo[\s\S]{0,180}wo\.operating_company_id = \$1::uuid/.test(routes)) {
      problems.push(`${ROUTES}: purchase-link validator must enforce active same-company vendor and same-company work order`);
    }
    if (!/if \(!purchaseResult\)[\s\S]{0,120}linked_entity_not_in_operating_company/.test(routes)) {
      problems.push(`${ROUTES}: cross-company purchase links must return the stable 400`);
    }
    if (!/parts_purchase_id: String\(purchaseRow\.id\)/.test(routes)) {
      problems.push(`${ROUTES}: POST /purchases must pass parts_purchase_id to postPartsInventoryPurchase`);
    }
    if (!/purchases\/:id\/void/.test(routes)) {
      problems.push(`${ROUTES}: must expose a void route for purchase events`);
    }
    if (!/voided_at = now\(\)/.test(routes) || !/DELETE FROM maintenance\.parts_purchases/.test(routes) === false) {
      // (kept simple: presence of voided_at write; absence-of-DELETE is enforced by the migration
      // grant check above, which is the authoritative append-only control)
      if (!/voided_at = now\(\)/.test(routes)) problems.push(`${ROUTES}: void route must set voided_at (never DELETE)`);
    }
    if (!/on_hand_qty = COALESCE\(on_hand_qty, 0\) - \$2/.test(routes)) {
      problems.push(`${ROUTES}: void route must exactly decrement the same stock row it incremented (no clamp)`);
    }
    if (!/AND COALESCE\(on_hand_qty, 0\) >= \$2[\s\S]{0,120}RETURNING on_hand_qty/.test(routes)
        || !/parts_purchase_reversal_insufficient_stock/.test(routes)) {
      problems.push(`${ROUTES}: void route must fail closed when the full purchase quantity is no longer on hand`);
    }
    const voidHandler = routes.match(/app\.post\("\/api\/v1\/maintenance\/parts-inventory\/purchases\/:id\/void",[\s\S]*?\n  \}\);/);
    if (!voidHandler || !/SELECT \* FROM maintenance\.parts_purchases[\s\S]{0,180}FOR UPDATE/.test(voidHandler[0])) {
      problems.push(`${ROUTES}: void route must lock the purchase event before checking/reversing stock`);
    }
  }

  if (!poster) {
    problems.push(`missing ${POSTER}`);
  } else {
    if (!/parts_purchase_id\?: string \| null/.test(poster)) {
      problems.push(`${POSTER}: PostPartsInventoryPurchaseInput must accept optional parts_purchase_id`);
    }
    if (!/input\.parts_purchase_id\s*\n\s*\?\s*`SELECT id::text, bill_id::text, expense_je_id::text\s*\n\s*FROM accounting\.parts_purchase_postings\s*\n\s*WHERE operating_company_id = \$1::uuid AND parts_purchase_id = \$2::uuid AND is_active/.test(poster)) {
      problems.push(`${POSTER}: already_posted lookup must key off parts_purchase_id when present (not just parts_inventory_id)`);
    }
  }

  return problems;
}

export function run() {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return { ok: false, offenders: problems };
  }
  console.log(`${LABEL}: PASS — append-only purchase SoR, real stock-upsert identity, atomic write, latch re-keyed, symmetric void`);
  return { ok: true, offenders: [] };
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const migrationReal = readRel(ROOT, MIGRATION);
  const routesReal = readRel(ROOT, ROUTES);
  const posterReal = readRel(ROOT, POSTER);

  const plant = (label, overrides, expectFragment) => {
    const problems = collectProblems(ROOT, overrides);
    if (!problems.some((p) => p.includes(expectFragment))) {
      console.error(`${LABEL} SELFTEST FAIL: planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  };

  plant(
    "migration-drops-worm-revoke",
    { [MIGRATION]: migrationReal.replace("REVOKE DELETE ON maintenance.parts_purchases FROM ih35_app", "-- removed") },
    "must REVOKE DELETE"
  );
  plant(
    "migration-drops-latch-rekey",
    { [MIGRATION]: migrationReal.replace("parts_purchase_id uuid REFERENCES maintenance.parts_purchases(id)", "-- removed") },
    "must additively key the GL poster latch"
  );
  plant(
    "route-reverts-to-bare-insert",
    { [ROUTES]: routesReal.replace(/ON CONFLICT \(operating_company_id, part_number\)[\s\S]{0,120}DO UPDATE SET/, "-- removed") },
    "must upsert stock via ON CONFLICT"
  );
  plant(
    "route-drops-latch-key-passthrough",
    { [ROUTES]: routesReal.replace("parts_purchase_id: String(purchaseRow.id),", "") },
    "must pass parts_purchase_id"
  );
  plant(
    "route-drops-purchase-link-validator",
    { [ROUTES]: routesReal.replace("const linksValid = await validatePartsPurchaseLinks(", "const linksValid = await missingPurchaseLinkValidation(") },
    "must validate vendor and work-order links"
  );
  plant(
    "route-allows-cross-company-vendor",
    { [ROUTES]: routesReal.replace("v.operating_company_id = $1::uuid", "TRUE") },
    "must enforce active same-company vendor"
  );
  plant(
    "route-writes-after-invalid-link",
    { [ROUTES]: routesReal.replace("if (!linksValid) return null;", "void linksValid;") },
    "must stop before the stock upsert"
  );
  plant(
    "route-drops-void-stock-symmetry",
    { [ROUTES]: routesReal.replace("on_hand_qty = COALESCE(on_hand_qty, 0) - $2", "on_hand_qty = on_hand_qty") },
    "must exactly decrement"
  );
  plant(
    "route-drops-insufficient-stock-fail-closed",
    { [ROUTES]: routesReal.replace("AND COALESCE(on_hand_qty, 0) >= $2", "") },
    "must fail closed"
  );
  plant(
    "route-drops-purchase-row-lock",
    { [ROUTES]: routesReal.replace("FOR UPDATE`,", "`,") },
    "must lock the purchase event"
  );
  plant(
    "poster-drops-purchase-id-param",
    { [POSTER]: posterReal.replace("parts_purchase_id?: string | null;", "") },
    "must accept optional parts_purchase_id"
  );

  console.log(`${LABEL} SELFTEST PASS — 11 planted regressions all caught`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
