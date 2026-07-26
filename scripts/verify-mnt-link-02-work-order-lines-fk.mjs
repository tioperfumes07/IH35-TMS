#!/usr/bin/env node
/**
 * MNT-LINK-02 — work_order_lines.work_order_uuid → maintenance.work_orders(id) FK.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIG = "db/migrations/202609070000_mnt_link_02_work_order_lines_wo_fk.sql";
const HELD = "db/migrations/.held-migrations.json";

function fail(msg) {
  console.error(`verify-mnt-link-02-work-order-lines-fk FAILED — ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(path.join(ROOT, MIG))) fail(`missing ${MIG}`);
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/.test(mig)) fail(`${MIG} must carry DO NOT RUN ON PROD`);
  if (!/fk_work_order_lines_work_order/.test(mig)) fail(`${MIG} must name fk_work_order_lines_work_order`);
  if (!/REFERENCES\s+maintenance\.work_orders\s*\(\s*id\s*\)/i.test(mig)) {
    fail(`${MIG} must FK work_order_uuid → maintenance.work_orders(id)`);
  }
  if (!/NOT VALID/.test(mig) || !/VALIDATE CONSTRAINT/.test(mig)) {
    fail(`${MIG} must use NOT VALID → VALIDATE pattern`);
  }
  if (!/orphan/i.test(mig)) fail(`${MIG} must ABORT on orphan lines`);

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

  console.log("verify-mnt-link-02-work-order-lines-fk OK — HELD migration + registry + orphan ABORT present");
}

main();
