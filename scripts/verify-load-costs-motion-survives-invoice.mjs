#!/usr/bin/env node
/**
 * GUARD: on the Load Costs board, an invoice must never remove a load that is still MOVING.
 *
 * WHY THIS EXISTS (measured live 2026-09-30):
 * The owner: "LOAD COSTS SHOULD SHOW ALL 16, ALL LOADBOARD VIEWS SHOULD SHOW THE SAME LOADS."
 * /api/v1/accounting/load-costs-board returned all 16 open USMCA loads. The board rendered 14.
 * The two it dropped came back status='dispatched', is_invoiced=true -- 13625 and 13626, freight
 * physically in transit carrying an invoice nobody authorised. `isClosed` was
 *     CLOSED.includes(r.status) || r.is_invoiced
 * so an accounting flag closed a load that was still on the road, and the two loads most in need
 * of attention were the only ones invisible.
 *
 * This is the SAME class of defect ROUND 18.1 already overturned once (is_resettlement hiding
 * in-route loads). It came back through a different flag. Hence a guard rather than a third fix.
 *
 * THE RULE: a load's PHYSICAL state decides whether it is in motion. An invoice may close a load
 * that has stopped moving; it may not close one that has not.
 *
 * Usage:  node scripts/verify-load-costs-motion-survives-invoice.mjs
 *         node scripts/verify-load-costs-motion-survives-invoice.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-load-costs-motion-survives-invoice";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

export function assertMotionSurvivesInvoice(src) {
  const problems = [];

  const closed = src.match(/const isClosed\s*=\s*\(r: BoardRow\)\s*=>\s*([^;]+);/);
  if (!closed) {
    problems.push(`${TARGET}: isClosed is gone or changed shape -- this guard cannot verify it.`);
    return problems;
  }
  const closedBody = closed[1];

  // A bare `|| r.is_invoiced` (not guarded by a motion test) is exactly the shipped regression.
  if (/\|\|\s*r\.is_invoiced\s*$/.test(closedBody.trim()) || /\|\|\s*r\.is_invoiced\s*\|\|/.test(closedBody)) {
    problems.push(
      `${TARGET}: isClosed closes on a bare \`r.is_invoiced\`. That hides loads that are still in a MOTION ` +
        `status -- measured live on 13625/13626 (status='dispatched', is_invoiced=true). An invoice may close a ` +
        `load that has stopped moving; it may not close one that has not. Guard it with \`&& !MOTION.includes(r.status)\`.`
    );
  } else if (closedBody.includes("r.is_invoiced") && !/MOTION\.includes\(r\.status\)/.test(closedBody)) {
    problems.push(
      `${TARGET}: isClosed uses r.is_invoiced without consulting MOTION. An accounting flag must not close a ` +
        `load whose status says it is still on the road.`
    );
  }

  const rese = src.match(/const isResettlement\s*=\s*\(r: BoardRow\)\s*=>\s*([\s\S]*?);\n/);
  if (!rese) {
    problems.push(`${TARGET}: isResettlement is gone or changed shape -- this guard cannot verify it.`);
  } else if (/r\.is_invoiced/.test(rese[1]) && !/MOTION\.includes\(r\.status\)/.test(rese[1])) {
    problems.push(
      `${TARGET}: isResettlement files a load away on r.is_invoiced without consulting MOTION. A dispatched load ` +
        `wearing an invoice is an anomaly to surface on Costs, not a resettlement to file away.`
    );
  }

  // MOTION itself must still name the statuses a rolling truck actually carries.
  const motion = src.match(/const MOTION\s*=\s*\[([^\]]*)\]/);
  if (!motion) {
    problems.push(`${TARGET}: the MOTION status list is gone -- the rule above cannot be expressed.`);
  } else {
    for (const required of ["dispatched", "at_pickup", "in_transit", "at_delivery"]) {
      if (!motion[1].includes(`"${required}"`)) {
        problems.push(`${TARGET}: MOTION no longer includes "${required}", so a load in that state can be closed by an invoice.`);
      }
    }
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const expect = (name, src, needle) => {
    const problems = assertMotionSurvivesInvoice(src);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "no problems"})`);
    }
  };

  const live = assertMotionSurvivesInvoice(good);
  if (live.length) failures.push(`live-file: ${live.join(" | ")}`);

  // 1. THE REAL REGRESSION -- the exact line that shipped and hid 13625/13626.
  expect(
    "bare-is-invoiced",
    good.replace(
      /const isClosed = \(r: BoardRow\) => CLOSED\.includes\(r\.status\) \|\| \(r\.is_invoiced && !MOTION\.includes\(r\.status\)\);/,
      "const isClosed = (r: BoardRow) => CLOSED.includes(r.status) || r.is_invoiced;"
    ),
    "bare `r.is_invoiced`"
  );

  // 2. is_invoiced consulted against something that is not the motion list.
  expect(
    "invoice-without-motion",
    good.replace(
      /const isClosed = \(r: BoardRow\) => CLOSED\.includes\(r\.status\) \|\| \(r\.is_invoiced && !MOTION\.includes\(r\.status\)\);/,
      'const isClosed = (r: BoardRow) => CLOSED.includes(r.status) || (r.is_invoiced && r.status !== "draft");'
    ),
    "without consulting MOTION"
  );

  // 3. Resettlement quietly files a rolling load away again.
  expect(
    "resettlement-swallows-motion",
    good.replace(/ && !MOTION\.includes\(r\.status\)\);\nexport const LOAD_COSTS_ELEMENT_MANIFEST/, ");\nexport const LOAD_COSTS_ELEMENT_MANIFEST"),
    "isResettlement files a load away"
  );

  // 4. A motion status is dropped from MOTION, which reopens the hole from the other side.
  expect("motion-loses-dispatched", good.replace(/"dispatched", /, ""), 'no longer includes "dispatched"');

  // 5. MOTION deleted outright.
  expect("motion-deleted", good.replace(/const MOTION = \[[^\]]*\]/, "const MOTION = null"), "MOTION status list is gone");

  // 6. isClosed deleted outright.
  expect("isclosed-deleted", good.replace(/const isClosed\s*=\s*\(r: BoardRow\)[^;]+;/, ""), "isClosed is gone");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 6/6 OK`);
  }
} else {
  const problems = assertMotionSurvivesInvoice(fs.readFileSync(path.join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
