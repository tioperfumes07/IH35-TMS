#!/usr/bin/env node
/**
 * SAF-B30 / F35 — accident spawn-wo must be idempotent and reloadable.
 *
 * Defect: POST spawn-wo always INSERTed a new maintenance.work_orders row. A double-click minted
 * two AC WOs; after reload the drawer forgot every prior WO because the id lived only in React
 * state (no durable reverse list on GET).
 *
 * Locked here (no migration — prod has no accident↔WO FK yet):
 *   1. spawn-wo looks up existing non-voided AC WOs whose description contains the accident id
 *   2. GET :id returns spawned_work_orders from that same lookup
 *   3. the drawer hydrates from detail + EntityLink-drills each WO
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ROUTES = join(ROOT, "apps/backend/src/safety/safety.routes.ts");
const DRAWER = join(ROOT, "apps/frontend/src/components/safety/AccidentReportDrawer.tsx");

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const CHECKS = [
  {
    id: "helper-list",
    file: ROUTES,
    describe: "listAccidentSpawnedWorkOrders must query AC WOs by accident id in description",
    test: (s) =>
      /function listAccidentSpawnedWorkOrders/.test(s) &&
      /source_type = 'AC'/.test(s) &&
      /description ILIKE/.test(s) &&
      /voided_at IS NULL/.test(s),
  },
  {
    id: "spawn-reuses",
    file: ROUTES,
    describe: "spawn-wo must reuse an existing WO (reused: true) before INSERT",
    test: (s) =>
      /listAccidentSpawnedWorkOrders\(client/.test(s) &&
      /reused:\s*true/.test(s) &&
      /existing\.length > 0/.test(s),
  },
  {
    id: "get-returns-list",
    file: ROUTES,
    describe: "GET accident detail must attach spawned_work_orders",
    test: (s) => /spawned_work_orders:\s*wos/.test(s) || /spawned_work_orders:\s*await listAccidentSpawnedWorkOrders/.test(s),
  },
  {
    id: "drawer-hydrates",
    file: DRAWER,
    describe: "drawer must hydrate spawned WOs from getSafetyAccidentDetail",
    test: (s) =>
      /getSafetyAccidentDetail/.test(s) &&
      /spawned_work_orders/.test(s) &&
      /setSpawnedWorkOrders/.test(s) &&
      /kind="work_order"/.test(s),
  },
  {
    id: "claim-forward-fk",
    file: ROUTES,
    describe: "spawned AC work order must persist the accident insurance_claim_id for scenario.accident",
    test: (s) =>
      /INSERT INTO maintenance\.work_orders[\s\S]{0,500}?insurance_claim_id/.test(s) &&
      /accident\.insurance_claim_id \?\? null/.test(s),
  },
  {
    id: "load-forward-fk",
    file: ROUTES,
    describe: "spawned AC work order must persist the accident load_id for trip reverse linkage",
    test: (s) =>
      /INSERT INTO maintenance\.work_orders[\s\S]{0,500}?load_id/.test(s) &&
      /accident\.load_id \?\? null/.test(s),
  },
  {
    id: "vendor-forward-fk",
    file: ROUTES,
    describe: "spawned AC work order must persist the accident repair vendor_id",
    test: (s) =>
      /INSERT INTO maintenance\.work_orders[\s\S]{0,500}?vendor_id/.test(s) &&
      /accident\.vendor_id \?\? null/.test(s),
  },
  {
    id: "trailer-forward-fk",
    file: ROUTES,
    describe: "spawned AC work order must map accident trailer_id to canonical equipment_id",
    test: (s) =>
      /INSERT INTO maintenance\.work_orders[\s\S]{0,500}?equipment_id/.test(s) &&
      /accident\.trailer_id \?\? null/.test(s),
  },
  {
    id: "claim-backfill-on-reuse",
    file: ROUTES,
    describe:
      "SCEN-01-WO-CLAIM-BACKFILL: reuse branch must backfill insurance_claim_id onto a WO spawned before the accident had a claim linked, not just at first-spawn INSERT time",
    test: (s) =>
      /listAccidentSpawnedWorkOrders[\s\S]{0,600}?insurance_claim_id/.test(s) &&
      /accidentClaimId\s*&&\s*accidentClaimId\s*!==\s*first\.insurance_claim_id/.test(s) &&
      /UPDATE maintenance\.work_orders[\s\S]{0,200}?SET insurance_claim_id = \$1::uuid/.test(s),
  },
];

export function run() {
  const failed = [];
  for (const c of CHECKS) {
    const src = strip(readFileSync(c.file, "utf8"));
    if (!c.test(src)) failed.push(c);
  }
  const ok = failed.length === 0;
  return {
    ok,
    message: ok
      ? `PASS: all ${CHECKS.length} of ${CHECKS.length} accident spawn-wo idempotency locks hold.`
      : `FAIL (${failed.length} of ${CHECKS.length}):\n  - ${failed.map((f) => `${f.describe} (${f.id})`).join("\n  - ")}`,
  };
}

function selftest() {
  const original = readFileSync(ROUTES, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.message}`);
    process.exit(1);
  }
  // Both the early-return payload and the audit payload carry `reused: true` — plant all of them.
  const planted = original.replaceAll("reused: true", "reused_was_true");
  try {
    writeFileSync(ROUTES, planted, "utf8");
    const caught = run();
    if (caught.ok || !/spawn-reuses/.test(caught.message)) {
      console.error(`SELFTEST FAIL: spawn-reuses plant not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: spawn-reuses plant");
  } finally {
    writeFileSync(ROUTES, original, "utf8");
  }
  const noVendorFk = original
    .replace(/\n\s*vendor_id,/, "")
    .replace(/\n\s*accident\.vendor_id \?\? null,/, "");
  try {
    writeFileSync(ROUTES, noVendorFk, "utf8");
    const caught = run();
    if (caught.ok || !/vendor-forward-fk/.test(caught.message)) {
      console.error(`SELFTEST FAIL: vendor-forward-fk plant not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: vendor-forward-fk plant");
  } finally {
    writeFileSync(ROUTES, original, "utf8");
  }
  const noTrailerFk = original
    .replace(/\n\s*equipment_id,/, "")
    .replace(/\n\s*accident\.trailer_id \?\? null,/, "");
  try {
    writeFileSync(ROUTES, noTrailerFk, "utf8");
    const caught = run();
    if (caught.ok || !/trailer-forward-fk/.test(caught.message)) {
      console.error(`SELFTEST FAIL: trailer-forward-fk plant not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: trailer-forward-fk plant");
  } finally {
    writeFileSync(ROUTES, original, "utf8");
  }
  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore left repository red.\n${after.message}`);
    process.exit(1);
  }
  const noClaimFk = original
    .replace(/\n\s*insurance_claim_id,/, "")
    .replace(/\n\s*accident\.insurance_claim_id \?\? null,/, "");
  try {
    writeFileSync(ROUTES, noClaimFk, "utf8");
    const caught = run();
    if (caught.ok || !/claim-forward-fk/.test(caught.message)) {
      console.error(`SELFTEST FAIL: claim-forward-fk plant not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: claim-forward-fk plant");
  } finally {
    writeFileSync(ROUTES, original, "utf8");
  }
  const noLoadFk = original
    .replace(/\n\s*load_id,/, "")
    .replace(/\n\s*accident\.load_id \?\? null,/, "");
  try {
    writeFileSync(ROUTES, noLoadFk, "utf8");
    const caught = run();
    if (caught.ok || !/load-forward-fk/.test(caught.message)) {
      console.error(`SELFTEST FAIL: load-forward-fk plant not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: load-forward-fk plant");
  } finally {
    writeFileSync(ROUTES, original, "utf8");
  }
  const noClaimBackfill = original.replace(
    /if \(accidentClaimId && accidentClaimId !== first\.insurance_claim_id\) \{[\s\S]*?\n {8}\}\n/,
    ""
  );
  if (noClaimBackfill === original) {
    console.error("SELFTEST FAIL: claim-backfill-on-reuse plant pattern did not match anything to remove.");
    process.exit(1);
  }
  try {
    writeFileSync(ROUTES, noClaimBackfill, "utf8");
    const caught = run();
    if (caught.ok || !/claim-backfill-on-reuse/.test(caught.message)) {
      console.error(`SELFTEST FAIL: claim-backfill-on-reuse plant not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: claim-backfill-on-reuse plant");
  } finally {
    writeFileSync(ROUTES, original, "utf8");
  }
  const afterBackfill = run();
  if (!afterBackfill.ok) {
    console.error(`SELFTEST FAIL: restore left repository red.\n${afterBackfill.message}`);
    process.exit(1);
  }
  console.log("SELFTEST PASS: planted defect caught and repository restored green.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
