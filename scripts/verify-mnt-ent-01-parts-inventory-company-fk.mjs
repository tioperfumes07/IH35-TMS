#!/usr/bin/env node
/** MNT-ENT-01 — parts_inventory.operating_company_id FK to org.companies. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-mnt-ent-01-parts-inventory-company-fk";
const SELFTEST = process.argv.includes("--selftest");
const MIG = path.join(ROOT, "db/migrations/202609100070_mnt_ent_01_parts_inventory_company_fk.sql");

/** @param {string} mig */
export function check(mig) {
  const problems = [];
  if (!mig) {
    problems.push("missing migration 202609100070_mnt_ent_01_parts_inventory_company_fk.sql");
    return problems;
  }
  if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must carry HOLD-FOR-JORGE");
  if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must carry DO NOT RUN ON PROD");
  if (!/parts_inventory_operating_company_id_fkey/.test(mig)) {
    problems.push("must ADD CONSTRAINT parts_inventory_operating_company_id_fkey");
  }
  if (!/REFERENCES\s+org\.companies\s*\(\s*id\s*\)/i.test(mig)) {
    problems.push("FK must REFERENCES org.companies(id)");
  }
  if (!/ABORT/i.test(mig)) problems.push("must ABORT on dangling operating_company_id");
  return problems;
}

function selftest() {
  const good = `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nABORT\nADD CONSTRAINT parts_inventory_operating_company_id_fkey\nREFERENCES org.companies(id)`;
  const bad = `REFERENCES org.company(id)`;
  if (check(good).length) throw new Error("compliant flagged");
  if (!check(bad).length) throw new Error("bad FK not caught");
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const mig = fs.existsSync(MIG) ? fs.readFileSync(MIG, "utf8") : "";
const problems = check(mig);
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — parts_inventory.operating_company_id → org.companies`);
