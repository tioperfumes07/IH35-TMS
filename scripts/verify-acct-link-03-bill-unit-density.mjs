#!/usr/bin/env node
/**
 * ACCT-LINK-03 — bills.unit_id density from memo backfill + create-path stamps.
 *
 * Static: createBill INSERT lists unit_id; WO auto-bill stamps unit_id; backfill mig present.
 * --live: unit_id density > 0 on non-void bills (lucia).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-link-03-bill-unit-density";
const SERVICE = "apps/backend/src/accounting/bills.service.ts";
const WO_SERVICE = "apps/backend/src/maintenance/two-section-service.ts";
const MIGRATION = "db/migrations/202610080000_acct_link_03_bill_unit_memo_backfill.sql";

function assertStatic(root = ROOT) {
  const problems = [];
  const bills = fs.readFileSync(path.join(root, SERVICE), "utf8");
  if (!/INSERT INTO accounting\.bills/.test(bills) || !/unit_id/.test(bills)) {
    problems.push("createBill must INSERT unit_id");
  }
  if (!/input\.unitId/.test(bills) && !/input\.unit_id/.test(bills)) {
    // createBill uses input.unitId
    if (!/input\.unitId/.test(bills)) problems.push("createBill must bind input.unitId");
  }
  const wo = fs.readFileSync(path.join(root, WO_SERVICE), "utf8");
  if (!/autoCreateBillFromWO/.test(wo) || !/unit_id/.test(wo)) {
    problems.push("autoCreateBillFromWO must stamp unit_id");
  }
  if (!fs.existsSync(path.join(root, MIGRATION))) {
    problems.push(`missing ${MIGRATION}`);
  } else {
    const mig = fs.readFileSync(path.join(root, MIGRATION), "utf8");
    if (!/b\.unit_id IS NULL/.test(mig)) {
      problems.push("backfill must target NULL bills.unit_id");
    }
    if (!/match_count = 1/.test(mig)) {
      problems.push("backfill must require unique memo→unit matches");
    }
    if (!/currently_leased_to_company_id/.test(mig) || !/owner_company_id/.test(mig)) {
      problems.push("backfill must entity-scope via owner OR leased_to");
    }
    if (!/\\\\m/.test(mig) && !/\\m/.test(mig)) {
      problems.push("backfill must use word-boundary memo tokens");
    }
  }
  return problems;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, ".tmp-link03-"));
  try {
    fs.mkdirSync(path.join(tmp, "apps/backend/src/accounting"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps/backend/src/maintenance"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "db/migrations"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, SERVICE),
      "INSERT INTO accounting.bills (\n unit_id\n)\n input.unitId"
    );
    fs.writeFileSync(
      path.join(tmp, WO_SERVICE),
      "export async function autoCreateBillFromWO() { unit_id }"
    );
    fs.writeFileSync(
      path.join(tmp, MIGRATION),
      "WHERE b.unit_id IS NULL\nmatch_count = 1\ncurrently_leased_to_company_id\nowner_company_id\n\\mTOKEN\\M"
    );
    const good = assertStatic(tmp);
    if (good.length) {
      console.error(`${LABEL} --selftest FAIL good`, good);
      process.exit(1);
    }
    const badRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-link03-bad-"));
    fs.mkdirSync(path.join(badRoot, "apps/backend/src/accounting"), { recursive: true });
    fs.mkdirSync(path.join(badRoot, "apps/backend/src/maintenance"), { recursive: true });
    fs.mkdirSync(path.join(badRoot, "db/migrations"), { recursive: true });
    fs.writeFileSync(path.join(badRoot, SERVICE), "INSERT INTO accounting.bills (vendor_id)");
    fs.writeFileSync(path.join(badRoot, WO_SERVICE), "export async function autoCreateBillFromWO() {}");
    fs.writeFileSync(path.join(badRoot, MIGRATION), "noop");
    if (!assertStatic(badRoot).length) {
      console.error(`${LABEL} --selftest FAIL bad not caught`);
      process.exit(1);
    }
    fs.rmSync(badRoot, { recursive: true, force: true });
    console.log(`${LABEL}: selftest PASS`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: LIVE skipped (no DATABASE_URL)`);
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const { rows } = await client.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(unit_id)::int AS with_unit,
             COUNT(insurance_claim_id)::int AS with_claim,
             COUNT(linked_work_order_uuid)::int AS with_wo
        FROM accounting.bills
       WHERE voided_at IS NULL
    `);
    const r = rows[0];
    if (!r || r.total === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 bills`);
      process.exit(1);
    }
    if (r.with_unit <= 0) {
      console.error(`${LABEL}: LIVE FAIL — unit_id density 0/${r.total}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: LIVE PASS — unit=${r.with_unit}/${r.total} claim=${r.with_claim} wo=${r.with_wo}`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = assertStatic();
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — static wiring + backfill mig present`);
if (process.argv.includes("--live")) {
  await live();
}
