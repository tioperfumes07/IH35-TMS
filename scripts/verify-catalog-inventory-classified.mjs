#!/usr/bin/env node
/**
 * LST-ORPH-05 — every catalogs.* table must carry a classification, and a RETIRE table must never
 * gain an editable route.
 *
 * The inventory (docs/inventories/catalog-inventory.json) classifies each table as ROUTED,
 * HEADLESS-BY-DESIGN or RETIRE. The block asks for CLASSIFICATION, not bulk routing — a headless
 * system lookup like audit_event_types should NOT get an operator surface, and catalogs.
 * cancellation_reasons (superseded by load_cancellation_reasons) must never become editable again.
 *
 * WHAT THIS ENFORCES IN CI, with no database:
 *   1. Every catalog the BACKEND routes has an inventory entry classified ROUTED. A new routed
 *      catalog that nobody classified fails here — that is how a table quietly becomes an operator
 *      surface without a ruling.
 *   2. No table classified RETIRE has a route. This is the ifta_states / cancellation_reasons hazard
 *      in guard form: retiring a catalog means nothing if a route reappears later.
 *
 * WHAT IT DOES NOT DO, deliberately: it does not fail on the 37 tables still UNCLASSIFIED. Those need
 * owner rulings, and failing CI on them would pressure someone into rubber-stamping 37 judgements to
 * get green. They are REPORTED on every run so they stay visible instead of forgotten.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const INVENTORY = join(ROOT, "docs/inventories/catalog-inventory.json");
const ROUTE_MAP = join(ROOT, "scripts/catalog-route-table-map.json");
const LABEL = "verify-catalog-inventory-classified";

export function analyse(inventory, routeMap) {
  const problems = [];
  const tables = inventory.tables ?? {};
  const routedTables = new Set(Object.values(routeMap));

  for (const table of routedTables) {
    const entry = tables[table];
    if (!entry) {
      problems.push(
        `catalogs.${table} is ROUTED by the backend but has NO inventory entry — classify it ` +
          `(ROUTED / HEADLESS-BY-DESIGN / RETIRE) before it becomes an operator surface by accident.`
      );
      continue;
    }
    if (entry.classification === "RETIRE") {
      problems.push(
        `catalogs.${table} is classified RETIRE but a route still points at it. Retiring a catalog ` +
          `means nothing if the route comes back — remove the route or change the ruling.`
      );
    }
    if (entry.classification === "HEADLESS-BY-DESIGN") {
      problems.push(
        `catalogs.${table} is classified HEADLESS-BY-DESIGN but the backend routes it. Either it is ` +
          `an operator surface (reclassify ROUTED) or the route should not exist.`
      );
    }
  }

  const unclassified = Object.entries(tables)
    .filter(([, v]) => v.classification === "UNCLASSIFIED")
    .map(([k]) => k);

  return { problems, unclassified, routedCount: routedTables.size };
}

export function run() {
  const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
  const routeMap = JSON.parse(readFileSync(ROUTE_MAP, "utf8"));
  const { problems, unclassified, routedCount } = analyse(inventory, routeMap);

  if (routedCount === 0) {
    return { ok: false, message: `${LABEL} FAIL: route map is empty — the guard lost its subject.` };
  }

  const ok = problems.length === 0;
  const backlog =
    unclassified.length > 0
      ? `\n  OUTSTANDING: ${unclassified.length} table(s) still UNCLASSIFIED and awaiting an owner ruling: ` +
        `${unclassified.slice(0, 12).join(", ")}${unclassified.length > 12 ? `, +${unclassified.length - 12} more` : ""}`
      : "";

  return {
    ok,
    message: ok
      ? `${LABEL} OK — all ${routedCount} routed catalog(s) are classified ROUTED; no RETIRE or ` +
        `HEADLESS table is routed.${backlog}`
      : `${LABEL} FAILED (${problems.length}):\n  - ${problems.join("\n  - ")}${backlog}`,
  };
}

function selftest() {
  const inv = {
    tables: {
      good: { classification: "ROUTED" },
      dead: { classification: "RETIRE" },
      quiet: { classification: "HEADLESS-BY-DESIGN" },
      pending: { classification: "UNCLASSIFIED" },
    },
  };

  let r = analyse(inv, { "good-seg": "good" });
  if (r.problems.length !== 0) {
    console.error(`SELFTEST FAIL: a correctly routed catalog was flagged: ${r.problems.join("; ")}`);
    process.exit(1);
  }
  if (!r.unclassified.includes("pending")) {
    console.error("SELFTEST FAIL: an UNCLASSIFIED table was not reported in the backlog.");
    process.exit(1);
  }
  console.log("  ok: a routed+classified catalog passes, and UNCLASSIFIED is reported not failed");

  r = analyse(inv, { "dead-seg": "dead" });
  if (!r.problems.some((p) => p.includes("classified RETIRE but a route still points at it"))) {
    console.error("SELFTEST FAIL: a route onto a RETIRE table was not caught.");
    process.exit(1);
  }
  console.log("  caught: a route pointing at a RETIRE catalog (the ifta_states hazard)");

  r = analyse(inv, { "quiet-seg": "quiet" });
  if (!r.problems.some((p) => p.includes("HEADLESS-BY-DESIGN but the backend routes it"))) {
    console.error("SELFTEST FAIL: a routed HEADLESS table was not caught.");
    process.exit(1);
  }
  console.log("  caught: a route onto a HEADLESS-BY-DESIGN catalog");

  r = analyse(inv, { "new-seg": "brand_new_table" });
  if (!r.problems.some((p) => p.includes("NO inventory entry"))) {
    console.error("SELFTEST FAIL: a routed table missing from the inventory was not caught.");
    process.exit(1);
  }
  console.log("  caught: a newly routed catalog with no classification");

  console.log("SELFTEST PASS — 4 cases: clean+backlog, RETIRE routed, HEADLESS routed, unclassified new route.");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
