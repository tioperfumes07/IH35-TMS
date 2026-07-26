#!/usr/bin/env node
/**
 * BANK-DOM-04 — reconciling-item aging/classification/escalation.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIG = "db/migrations/202609110000_bank_dom_04_reconciling_item_aging.sql";
const HELD = "db/migrations/.held-migrations.json";
const HELPER = "apps/backend/src/banking/reconciling-item-aging.ts";
const ROUTES = "apps/backend/src/banking/reconciliation.routes.ts";

function fail(msg) {
  console.error(`verify-bank-dom-04-reconciling-item-aging FAILED — ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(path.join(ROOT, MIG))) fail(`missing ${MIG}`);
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/.test(mig)) fail(`${MIG} must carry DO NOT RUN ON PROD`);
  if (!/reconciling_item_class/.test(mig)) fail(`${MIG} must add reconciling_item_class`);
  if (!/reconciling_item_escalated_at/.test(mig)) fail(`${MIG} must add reconciling_item_escalated_at`);

  const held = JSON.parse(fs.readFileSync(path.join(ROOT, HELD), "utf8"));
  const fname = path.basename(MIG);
  // Owner confirmed live 2026-07-26 (Cursor owner-batch, GUARD direct Neon query against
  // _system._schema_migrations) that this migration is genuinely applied on prod — it now lives in
  // applied_held[] with applied_on_prod:true, which is the correct, expected state. Union both
  // arrays so a registered-but-now-applied migration doesn't fall out of this guard's check.
  const allEntries = [...(held.held ?? []), ...(held.applied_held ?? [])];
  if (!allEntries.some((e) => e.file === fname)) {
    fail(`${fname} must be in .held-migrations.json (held[] or applied_held[])`);
  }

  const helper = fs.readFileSync(path.join(ROOT, HELPER), "utf8");
  if (!/ageUnclearedTransactions/.test(helper)) fail(`${HELPER} must export ageUnclearedTransactions`);
  if (!/age_bucket/.test(helper) || !/escalated/.test(helper)) {
    fail(`${HELPER} must compute age_bucket + escalated`);
  }

  const routes = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
  if (!/ageUnclearedTransactions/.test(routes)) {
    fail(`${ROUTES} must surface aged reconciling items`);
  }
  if (!/reconciling_items/.test(routes)) {
    fail(`${ROUTES} must return reconciling_items`);
  }

  console.log("verify-bank-dom-04-reconciling-item-aging OK");
}

main();
