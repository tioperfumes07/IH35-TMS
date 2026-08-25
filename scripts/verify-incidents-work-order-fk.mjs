#!/usr/bin/env node
/**
 * verify-incidents-work-order-fk.mjs — MAINTENANCE-DAMAGE-REGISTER-CANONICAL-WO-FK
 *
 * safety.incidents had no canonical FK to the maintenance work order its own auto-workflow spawns for
 * equipment/breakdown incidents, so the Maintenance Damage Register could never render a real "Linked WO"
 * drill-through. Asserts the shipped fix:
 *   1. Migration adds a nullable `work_order_id` FK column to safety.incidents -> maintenance.work_orders,
 *      idempotent (IF NOT EXISTS / pg_constraint guard).
 *   2. auto-workflow-trigger.ts stamps work_order_id back onto the incident row right after it spawns the
 *      draft WO (not left as a response-only value).
 *   3. incidents.routes.ts LEFT JOINs maintenance.work_orders and projects work_order_display_id in both
 *      the list and detail SELECTs.
 *   4. MaintenanceDamageRegisterTab.tsx renders a real "Linked WO" EntityLink column (no longer DEFERRED).
 *
 * Usage:
 *   node scripts/verify-incidents-work-order-fk.mjs            # scan
 *   node scripts/verify-incidents-work-order-fk.mjs --selftest # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-incidents-work-order-fk";

const MIGRATION = "db/migrations/202612580000_incidents_work_order_fk.sql";
const TRIGGER = "apps/backend/src/safety/incidents/auto-workflow-trigger.ts";
const ROUTES = "apps/backend/src/safety/incidents.routes.ts";
const TAB = "apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];

  const migration = readRel(root, MIGRATION, overrides);
  if (!migration) {
    problems.push(`missing ${MIGRATION}`);
  } else {
    if (!/ADD COLUMN IF NOT EXISTS work_order_id uuid/.test(migration)) {
      problems.push(`${MIGRATION}: must add work_order_id column (idempotent)`);
    }
    if (!/REFERENCES maintenance\.work_orders\(id\) ON DELETE SET NULL/.test(migration)) {
      problems.push(`${MIGRATION}: work_order_id must FK to maintenance.work_orders(id) ON DELETE SET NULL`);
    }
    if (!/pg_constraint WHERE conname = 'incidents_work_order_id_fkey'/.test(migration)) {
      problems.push(`${MIGRATION}: FK add must be guarded idempotent via pg_constraint check`);
    }
  }

  const trigger = readRel(root, TRIGGER, overrides);
  if (!trigger) {
    problems.push(`missing ${TRIGGER}`);
  } else {
    if (!/spawnMaintenanceDraftWorkOrder\(client, input\);\s*\n[\s\S]{0,400}?UPDATE safety\.incidents SET work_order_id = \$1::uuid WHERE id = \$2::uuid/.test(trigger)) {
      problems.push(`${TRIGGER}: must stamp work_order_id back onto the incident right after spawning the draft WO`);
    }
    const swallowedWrites = [
      ["work-order display allocator", /next_wo_display_id[\s\S]{0,500}?\.catch\s*\(/],
      ["work-order insert", /INSERT INTO maintenance\.work_orders[\s\S]{0,500}?\.catch\s*\(/],
      ["domain-row insert", /INSERT INTO \$\{qualified\}[\s\S]{0,500}?\.catch\s*\(/],
      ["incident work-order FK update", /UPDATE safety\.incidents SET work_order_id[\s\S]{0,300}?\.catch\s*\(/],
    ];
    for (const [label, pattern] of swallowedWrites) {
      if (pattern.test(trigger)) problems.push(`${TRIGGER}: ${label} failure must propagate instead of becoming a silent nullable workflow result`);
    }
  }

  const routes = readRel(root, ROUTES, overrides);
  if (!routes) {
    problems.push(`missing ${ROUTES}`);
  } else {
    const joinCount = (routes.match(/LEFT JOIN maintenance\.work_orders wo\s*\n\s*ON wo\.id = i\.work_order_id/g) || []).length;
    if (joinCount < 2) problems.push(`${ROUTES}: both list and detail SELECTs must LEFT JOIN maintenance.work_orders (found ${joinCount}/2)`);
    const projCount = (routes.match(/wo\.display_id AS work_order_display_id/g) || []).length;
    if (projCount < 2) problems.push(`${ROUTES}: both list and detail SELECTs must project wo.display_id AS work_order_display_id (found ${projCount}/2)`);
  }

  const tab = readRel(root, TAB, overrides);
  if (!tab) {
    problems.push(`missing ${TAB}`);
  } else {
    if (/Linked WO — DEFERRED/.test(tab)) problems.push(`${TAB}: stale DEFERRED comment must be removed now the FK exists`);
    if (!/label: "Linked WO"/.test(tab)) problems.push(`${TAB}: must render a real "Linked WO" column`);
    if (!/kind="work_order"/.test(tab)) problems.push(`${TAB}: Linked WO column must use EntityLink kind="work_order"`);
    if (!/work_order_id: string \| null/.test(tab)) problems.push(`${TAB}: row type must carry work_order_id`);
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
  console.log(`${LABEL}: PASS — safety.incidents.work_order_id FK stamped, joined, and rendered as a real Linked WO drill-through`);
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
  const triggerReal = readRel(ROOT, TRIGGER);
  const routesReal = readRel(ROOT, ROUTES);
  const tabReal = readRel(ROOT, TAB);

  const plant = (label, overrides, expectFragment) => {
    const problems = collectProblems(ROOT, overrides);
    if (!problems.some((p) => p.includes(expectFragment))) {
      console.error(`${LABEL} SELFTEST FAIL: planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  };

  plant(
    "migration-drops-fk",
    { [MIGRATION]: migrationReal.replace("REFERENCES maintenance.work_orders(id) ON DELETE SET NULL", "") },
    "must FK to maintenance.work_orders"
  );
  plant(
    "trigger-drops-stamp",
    {
      [TRIGGER]: triggerReal.replace(
        /if \(maintenanceWorkOrderId\) \{\s*\n[\s\S]*?\n    \}\n  \}/,
        "if (maintenanceWorkOrderId) {\n      // stamp removed\n    }\n  }"
      ),
    },
    "must stamp work_order_id"
  );
  for (const [label, needle] of [
    ["display allocator swallow", "      );\n    generatedDisplayId"],
    ["work-order insert swallow", "      values\n    );\n  return res.rows[0]?.id ?? null;"],
    ["domain insert swallow", "      values\n    );\n  return res.rows[0]?.id ?? null;\n}\n\nasync function notifyIncidentStakeholders"],
    ["incident FK update swallow", "          input.incident_id,\n        ]);"],
  ]) {
    plant(
      label,
      { [TRIGGER]: triggerReal.replace(needle, needle.replace(");", ").catch(() => ({ rows: [] }));")) },
      "failure must propagate"
    );
  }
  plant(
    "routes-drops-one-join",
    { [ROUTES]: routesReal.replace(
        /LEFT JOIN maintenance\.work_orders wo\s*\n\s*ON wo\.id = i\.work_order_id\s*\n\s*AND wo\.operating_company_id = i\.operating_company_id\s*\n\s*WHERE i\.id = \$1/,
        "WHERE i.id = $1"
      ) },
    "both list and detail SELECTs must LEFT JOIN"
  );
  plant(
    "tab-reverts-to-deferred",
    {
      [TAB]: tabReal.replace(
        /\{\s*\/\/ MAINTENANCE-DAMAGE-REGISTER-CANONICAL-WO-FK[\s\S]*?\n    \},\n    \{\n      key: "status",/,
        '// Linked WO — DEFERRED: safety.incidents has no work_order link column (gated additive migration later).\n    {\n      key: "status",'
      ),
    },
    'must render a real "Linked WO"'
  );

  console.log(`${LABEL} SELFTEST PASS — 8 planted regressions all caught`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
