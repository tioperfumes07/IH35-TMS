#!/usr/bin/env node
/**
 * DISP-F02 — no migration may (re)define views.units_with_dispatch_status as an empty stub.
 *
 * Migration 0048 created this view inside a DO block with an $EMPTY$ fallback —
 * "SELECT NULL::uuid AS id, ... WHERE false" — taken when maintenance.work_orders did not yet exist.
 * On prod that branch fired and the view returned ZERO rows for every unit, silently disabling
 * WF-050 (DVIR-MAJOR) and WF-044 (PM-DUE) for the entire life of the system.
 *
 * 202611120000 restores the real definition. This guard stops the stub from coming back: any LATER
 * migration that defines this view with a `WHERE false` body fails. 0048 itself is grandfathered by
 * exact filename — it is checksum-frozen and cannot be edited, and its stub is superseded.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const VIEW = "units_with_dispatch_status";
const FROZEN = new Set(["0048_p3_t11_5_1_dispatch_gates.sql"]);
const LABEL = "verify-dispatch-status-view-not-stub";

export function auditMigration(name, src) {
  if (FROZEN.has(name)) return [];
  if (!src.includes(VIEW)) return [];
  const stubbed = /CREATE\s+OR\s+REPLACE\s+VIEW\s+views\.units_with_dispatch_status[\s\S]{0,900}?WHERE\s+false/i.test(src);
  return stubbed
    ? [
        `${DIR}/${name}: defines views.${VIEW} with a WHERE false body. That is the DISP-F02 stub — it ` +
          `returns zero rows for every unit and silently disables WF-050 (DVIR-MAJOR) and WF-044 ` +
          `(PM-DUE). A safety view that is empty is worse than one that is missing: the joins still ` +
          `succeed and the gates simply never fire.`,
      ]
    : [];
}

function auditTree() {
  return readdirSync(join(ROOT, DIR))
    .filter((f) => f.endsWith(".sql"))
    .flatMap((f) => auditMigration(f, readFileSync(join(ROOT, DIR, f), "utf8")));
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real migrations flagged: ${auditTree().join(" | ")}`);
  const stub = `CREATE OR REPLACE VIEW views.units_with_dispatch_status WITH (security_invoker = true) AS SELECT NULL::uuid AS id WHERE false;`;
  if (!auditMigration("209901010000_x.sql", stub).some((p) => p.includes("WHERE false")))
    failures.push("case1 FAIL — a reintroduced stub was NOT caught");
  if (auditMigration("0048_p3_t11_5_1_dispatch_gates.sql", stub).length !== 0)
    failures.push("case2 FAIL — the checksum-frozen 0048 was not grandfathered");
  const real = `CREATE OR REPLACE VIEW views.units_with_dispatch_status WITH (security_invoker = true) AS SELECT u.id FROM mdata.units u WHERE u.deactivated_at IS NULL;`;
  if (auditMigration("209901010000_x.sql", real).length !== 0)
    failures.push("case3 FAIL — the real definition was wrongly flagged");
  if (failures.length) { for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`); process.exit(1); }
  console.log(`${LABEL}: selftest PASS — stub caught, frozen 0048 grandfathered, real definition passes`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) { for (const p of problems) console.error(`  ✗ ${p}`); process.exit(1); }
  console.log(`${LABEL} OK — no migration re-stubs views.${VIEW}`);
}
main();
