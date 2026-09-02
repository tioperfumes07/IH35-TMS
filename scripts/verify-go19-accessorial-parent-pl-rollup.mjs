#!/usr/bin/env node
/**
 * GO-19 slice 19 — accessorial income P&L roll-up guard.
 *
 * USMCA 4210/4220/4230/4240 must be parented under 4200 Accessorial and Detention Income so the
 * chart matches QuickBooks sub-account roll-up (same pattern as 4900 → 4910–4980). The defect was
 * four flat top-level income lines beside 4200 with no hierarchy.
 *
 * Static ratchet on the migration file: UPDATE-only parent wiring, USMCA-scoped, all four children,
 * no INSERT that would mint a new catalogs.accounts row in this migration.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const LABEL = "verify-go19-accessorial-parent-pl-rollup";
const MATCH = /go19_accessorial_parent_id_under_4200\.sql$/;
const CHILDREN = ["4210", "4220", "4230", "4240"];

export function auditMigration(sql) {
  const problems = [];
  if (!/code\s*=\s*'USMCA'/i.test(sql)) {
    problems.push(`${DIR}: migration must resolve USMCA by org.companies.code = 'USMCA'`);
  }
  if (!/account_number\s*=\s*'4200'/i.test(sql)) {
    problems.push(`${DIR}: migration must resolve parent account 4200`);
  }
  for (const num of CHILDREN) {
    if (!new RegExp(`'${num}'`).test(sql)) {
      problems.push(`${DIR}: migration must wire child account ${num}`);
    }
  }
  if (!/parent_account_id/i.test(sql)) {
    problems.push(`${DIR}: migration must set parent_account_id on the four children`);
  }
  if (!/UPDATE\s+catalogs\.accounts/i.test(sql)) {
    problems.push(`${DIR}: fix must UPDATE existing rows — no new account mint in this migration`);
  }
  if (/INSERT\s+INTO\s+catalogs\.accounts/i.test(sql)) {
    problems.push(`${DIR}: GO-19-19 forbids INSERT INTO catalogs.accounts — parent wiring only`);
  }
  if (!/IS DISTINCT FROM/i.test(sql)) {
    problems.push(`${DIR}: migration must be idempotent (IS DISTINCT FROM guard on parent_account_id)`);
  }
  if (!/4900|4910|short.?pay|mirror/i.test(sql)) {
    problems.push(`${DIR}: migration must document the 4900→4910 mirror pattern in header comments`);
  }
  return problems;
}

function auditTree() {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => MATCH.test(f));
  if (files.length === 0) {
    return [`${DIR}: expected *go19_accessorial_parent_id_under_4200.sql migration — not found`];
  }
  if (files.length > 1) {
    return [`${DIR}: multiple go19 accessorial parent migrations — expected exactly one`];
  }
  return auditMigration(readFileSync(join(ROOT, DIR, files[0]), "utf8"));
}

function selftest() {
  const failures = [];
  const good = `-- mirror 4900 -> 4910 pattern
DO $$
DECLARE v_usmca uuid; v_parent uuid; r RECORD;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  SELECT id INTO v_parent FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '4200';
  FOR r IN SELECT unnest(ARRAY['4210','4220','4230','4240']) AS num LOOP
    UPDATE catalogs.accounts child SET parent_account_id = v_parent
    WHERE child.account_number = r.num AND child.parent_account_id IS DISTINCT FROM v_parent;
  END LOOP;
END $$;`;

  if (auditMigration(good).length !== 0) {
    failures.push(`case1 FAIL — correct migration flagged: ${auditMigration(good).join(" | ")}`);
  }

  const missing4210 = good.replace("'4210'", "'9999'");
  if (!auditMigration(missing4210).some((p) => p.includes("4210"))) {
    failures.push("case2 FAIL — missing 4210 child was NOT caught");
  }

  const insertBad = good.replace("UPDATE catalogs.accounts", "INSERT INTO catalogs.accounts");
  if (!auditMigration(insertBad).some((p) => p.includes("INSERT INTO catalogs.accounts"))) {
    failures.push("case3 FAIL — INSERT mint was NOT caught");
  }

  const noDistinct = good.replace("IS DISTINCT FROM v_parent", "= v_parent");
  if (!auditMigration(noDistinct).some((p) => p.includes("idempotent"))) {
    failures.push("case4 FAIL — non-idempotent update was NOT caught");
  }

  const tree = auditTree();
  if (tree.length !== 0) {
    failures.push(`case5 FAIL — real migration flagged: ${tree.join(" | ")}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — good migration clean, missing child caught, INSERT caught, idempotency caught, tree clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`${LABEL} FAIL: ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
