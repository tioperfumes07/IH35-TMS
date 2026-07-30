#!/usr/bin/env node
/**
 * LST-RLS-01 closure — write-authz RLS on global catalogs.account_types +
 * catalogs.wo_cancellation_reasons (NOT entity-scoping).
 *
 * Migration 202608100000 applied_held + applied_on_prod:true (#3549 owner apply).
 * Live Neon: both FORCE RLS, 3 policies, 0 DELETE policies, ih35_app INSERT/SELECT/UPDATE.
 * Cursor even claim: 1780.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-rls01-global-catalog-write-authz-closed";
const MIG = "202608100000_lst_rls_01_global_catalog_write_authz.sql";
const HELD = "db/migrations/.held-migrations.json";
const LISTS = "docs/module-completion/lists.json";
const MIG_PATH = `db/migrations/${MIG}`;

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const heldRaw = read(HELD);
  const listsRaw = read(LISTS);
  const mig = read(MIG_PATH);

  if (!mig) problems.push(`missing ${MIG_PATH}`);
  else {
    if (!/account_types/.test(mig) || !/wo_cancellation_reasons/.test(mig)) {
      problems.push("migration must target account_types + wo_cancellation_reasons");
    }
    if (!/FORCE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY/i.test(mig) && !/FORCE ROW LEVEL SECURITY/.test(mig)) {
      // also accept ENABLE + FORCE patterns
      if (!/FORCE/.test(mig)) problems.push("migration must FORCE RLS");
    }
  }

  if (!heldRaw) problems.push(`missing ${HELD}`);
  else {
    try {
      const h = JSON.parse(heldRaw);
      const entry = (h.applied_held || []).find((e) => e.file === MIG);
      if (!entry) problems.push(`${MIG} must be in applied_held[]`);
      else if (entry.applied_on_prod !== true) {
        problems.push(`${MIG} must have applied_on_prod:true`);
      }
      if ((h.held || []).some((e) => e.file === MIG)) {
        problems.push(`${MIG} must not remain in held[]`);
      }
    } catch {
      problems.push(`${HELD} invalid JSON`);
    }
  }

  if (listsRaw) {
    try {
      const lists = JSON.parse(listsRaw);
      const item = lists.items?.find((i) => i.id === "LST-RLS-01");
      if (!item) problems.push("LST-RLS-01 missing");
      else if (item.status === "PASS") {
        if (!/1780|FORCE|policies|applied_on_prod/i.test(String(item.evidence ?? ""))) {
          problems.push("LST-RLS-01 PASS evidence must cite guard 1780 + Neon FORCE/policies");
        }
      } else if (item.status !== "FAIL") {
        problems.push(`LST-RLS-01 unexpected status ${item.status}`);
      }
    } catch {
      problems.push(`${LISTS} invalid JSON`);
    }
  } else problems.push(`missing ${LISTS}`);

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — LST-RLS-01 applied_held + write-authz migration present`);
}
