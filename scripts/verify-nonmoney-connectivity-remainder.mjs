#!/usr/bin/env node
/**
 * verify-nonmoney-connectivity-remainder.mjs
 *
 * @matrix-built {"modules":["accounting","banking","driver-hub","factoring","fuel","legal","lists","maintenance","reports"],"cols":["connectivity"],"leaves":["accounting.modal.decide_fault","accounting.panel.factoring_interest_accrual","accounting.panel.faro_cash_reserve_reclass","accounting.panel.register_inline_edit","banking.panel.banking_kpi","driver-hub.panel.driver","factoring.panel.factoring_cash_flow","factoring.panel.factoring_kpi","factoring.panel.factoring_purchase_links","factoring.panel.factoring_reserves_shared","factoring.panel.faro_reserve_register","factoring.panel.payments_to_you","factoring.panel.repurchase_due","factoring.panel.save_error","fuel.drawer.end_card","fuel.drawer.void_card","fuel.modal.card_overage_exempt","fuel.modal.card_overage_void","fuel.panel.card_issuers","legal.panel.matter_reserve","lists.panel.ledger_kpi","maintenance.panel.pm_cost_per_mile","reports.panel.three_mile_cpm"],"task":"DEVIN-NONMONEY-CONNECTIVITY-REMAINDER-23"}
 *
 * Owns the 23 non-money connectivity cells that merged required.json leaves left unclaimed
 * (verify-codex-vertical-nonmoney-zero-remainder reported them as unowned canonical-column gaps).
 * For each named leaf this guard asserts the leaf exists in its module's required.json AND that
 * its route_hint resolves to a mounted route or a real surface:// component — the exact
 * connectivity contract, using the canonical auditConnectivity shared with wave-b.
 *
 * Ratchet: the set is EXACT. A leaf removed from required.json, a leaf whose route unmounts, or a
 * leaf renamed all fail here; a NEW unowned leaf still fails the zero-remainder census until some
 * guard claims it. --selftest mutates a fixture leaf and proves the check discriminates.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const ROUTE_SOURCES = [
  "apps/frontend/src/routes/manifest.tsx",
  "apps/frontend/src/routes/collections.routes.ts",
  "apps/frontend/src/router/route-manifest.ts",
];
const LABEL = "verify-nonmoney-connectivity-remainder";

const OWNED = new Map([
  ["accounting", ["accounting.modal.decide_fault", "accounting.panel.factoring_interest_accrual", "accounting.panel.faro_cash_reserve_reclass", "accounting.panel.register_inline_edit"]],
  ["banking", ["banking.panel.banking_kpi"]],
  ["driver-hub", ["driver-hub.panel.driver"]],
  ["factoring", ["factoring.panel.factoring_cash_flow", "factoring.panel.factoring_kpi", "factoring.panel.factoring_purchase_links", "factoring.panel.factoring_reserves_shared", "factoring.panel.faro_reserve_register", "factoring.panel.payments_to_you", "factoring.panel.repurchase_due", "factoring.panel.save_error"]],
  ["fuel", ["fuel.drawer.end_card", "fuel.drawer.void_card", "fuel.modal.card_overage_exempt", "fuel.modal.card_overage_void", "fuel.panel.card_issuers"]],
  ["legal", ["legal.panel.matter_reserve"]],
  ["lists", ["lists.panel.ledger_kpi"]],
  ["maintenance", ["maintenance.panel.pm_cost_per_mile"]],
  ["reports", ["reports.panel.three_mile_cpm"]],
]);

export function collectOwnedLeaves(readDir = fs.readdirSync, read = fs.readFileSync) {
  const failures = [];
  const leaves = [];
  for (const [moduleId, ids] of OWNED) {
    const file = path.join(MODULE_DIR, `${moduleId}.required.json`);
    let spec;
    try {
      spec = JSON.parse(read(file, "utf8"));
    } catch {
      failures.push(`${moduleId}: required.json missing for owned connectivity leaves`);
      continue;
    }
    const byId = new Map((spec.leaves ?? []).map((leaf) => [leaf.id, leaf]));
    for (const id of ids) {
      const leaf = byId.get(id);
      if (!leaf) {
        failures.push(`${moduleId}:${id}: owned leaf removed or renamed in required.json`);
        continue;
      }
      if (!(leaf.required ?? []).includes("connectivity")) {
        failures.push(`${moduleId}:${id}: leaf no longer requires connectivity — remove it from this guard's claim`);
        continue;
      }
      leaves.push({ module: moduleId, id: leaf.id, route: leaf.route_hint });
    }
  }
  return { failures, leaves };
}

export function evaluate(readDir = fs.readdirSync, read = fs.readFileSync) {
  const manifest = ROUTE_SOURCES.map((file) => {
    try {
      return read(path.join(ROOT, file), "utf8");
    } catch {
      return "";
    }
  }).join("\n");
  const { failures, leaves } = collectOwnedLeaves(readDir, read);
  if (leaves.length !== [...OWNED.values()].flat().length) {
    failures.push(`owned-leaf inventory drifted: expected ${[...OWNED.values()].flat().length}, resolved ${leaves.length}`);
  }
  return [...failures, ...auditConnectivity(manifest, leaves, 0)];
}

function selftest() {
  const failures = evaluate();
  if (failures.length) throw new Error(`clean baseline red: ${failures.join("; ")}`);
  // Mutation 1: a leaf whose route_hint is unmounted must fail.
  const manifest = "";
  const caught = auditConnectivity(manifest, [{ module: "lists", id: "lists.panel.ledger_kpi", route: "/lists/ledger" }], 0);
  if (!caught.length) throw new Error("unmounted route escaped detection");
  // Mutation 2: a required.json that drops an owned leaf must fail the inventory.
  const emptyDir = () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };
  const { failures: drift } = collectOwnedLeaves(emptyDir, emptyDir);
  if (!drift.length) throw new Error("missing required.json escaped detection");
  console.log(`[${LABEL}] --selftest PASS: rejected 2/2 planted connectivity mutations`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = evaluate();
  if (failures.length) {
    console.error(`${LABEL} — FAILED`);
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — 23 non-money remainder leaves resolve to mounted routes/surfaces`);
}
