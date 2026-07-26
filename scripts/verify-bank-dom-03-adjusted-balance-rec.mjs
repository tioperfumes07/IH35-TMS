#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIG = "db/migrations/202609080000_bank_dom_03_adjusted_balance_rec.sql";
const HELPER = "apps/backend/src/banking/adjusted-balance-rec.ts";
const ROUTES = "apps/backend/src/banking/reconciliation.routes.ts";
const HELD = "db/migrations/.held-migrations.json";

function fail(msg) {
  console.error(`verify-bank-dom-03-adjusted-balance-rec FAILED — ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(path.join(ROOT, MIG))) fail(`missing ${MIG}`);
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/.test(mig)) fail(`${MIG} must carry DO NOT RUN ON PROD`);
  for (const col of [
    "beginning_balance_cents",
    "deposits_in_transit_cents",
    "outstanding_checks_cents",
    "adjusted_bank_balance_cents",
    "adjusted_book_balance_cents",
  ]) {
    if (!mig.includes(col)) fail(`${MIG} must add ${col}`);
  }

  const helper = fs.readFileSync(path.join(ROOT, HELPER), "utf8");
  if (!/computeAdjustedBalanceSummary/.test(helper)) fail(`${HELPER} missing computeAdjustedBalanceSummary`);
  if (!/depositsInTransitCents/.test(helper) || !/outstandingChecksCents/.test(helper)) {
    fail(`${HELPER} must compute DIT + outstanding checks`);
  }

  const routes = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
  if (!/computeAdjustedBalanceSummary/.test(routes) && !/computeSummaryFromTransactions\(/.test(routes)) {
    fail(`${ROUTES} must use adjusted-balance summary`);
  }
  if (!/reconciliation\/:sessionId\/clear/.test(routes)) {
    fail(`${ROUTES} must expose clear/uncleared endpoint`);
  }
  if (!/beginning_balance_cents/.test(routes)) fail(`${ROUTES} must carry beginning balance into sessions`);

  const held = JSON.parse(fs.readFileSync(path.join(ROOT, HELD), "utf8"));
  const fname = path.basename(MIG);
  // Owner confirmed live 2026-07-26 (Cursor owner-batch, GUARD direct Neon query against
  // _system._schema_migrations) that this migration is genuinely applied on prod — it now lives in
  // applied_held[] with applied_on_prod:true, which is the correct, expected state. Union both
  // arrays so a registered-but-now-applied migration doesn't fall out of this guard's check.
  const allEntries = [...(held.held ?? []), ...(held.applied_held ?? [])];
  if (!allEntries.some((e) => e.file === fname)) fail(`${fname} must be in .held-migrations.json (held[] or applied_held[])`);

  console.log("verify-bank-dom-03-adjusted-balance-rec OK");
}

main();
