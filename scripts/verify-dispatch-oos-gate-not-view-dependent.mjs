#!/usr/bin/env node
/**
 * DISP-F01 — a dispatch safety gate must never depend on a view being alive.
 *
 * WHY (verified on prod br-fancy-credit-akjnd07a, 2026-08-02, under is_lucia_bypass):
 * views.units_with_dispatch_status is a DEAD STUB. Its definition is literally
 *   SELECT NULL::uuid AS id, … false AS is_dispatch_blocked, … WHERE false;
 * so it returns ZERO rows for every unit, always. Three dispatch paths joined it, and they failed
 * three DIFFERENT ways — which is why this went unnoticed:
 *   pre-dispatch-validator  INNER JOIN -> 0 rows -> `if (!unit) return []` -> FAILS OPEN, no items
 *   book-load               optionalQuery -> null -> `unit?.…` falsy -> FAILS OPEN, and it never
 *                           checked is_oos at all
 *   quicksave               INNER JOIN -> 0 rows -> throw E_VALIDATION_UNIT_UNAVAILABLE -> FAILS
 *                           CLOSED, i.e. no unit could be quicksaved
 * Live consequence: 13 active OOS units — TRK-owned, leased to TRANSP — were dispatchable. Only
 * quick-assign.service.ts blocked them, because it alone read is_oos straight from mdata.units.
 *
 * THE INVARIANT: is_oos is read from mdata.units (the authority), the unit row is driven FROM
 * mdata.units, and the view may only be LEFT JOINed for advisory columns. A dead view then degrades
 * advisories to false; it can never switch a safety block off.
 *
 * SCOPING: mdata.units has NO operating_company_id (§4) — it carries owner_company_id and
 * currently_leased_to_company_id. A filter on v.operating_company_id could not have matched a
 * TRK-owned unit leased to TRANSP even with a live view, and that is exactly the OOS population, so
 * the lease-aware COALESCE is part of the invariant rather than a detail.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-dispatch-oos-gate-not-view-dependent";
const VIEW = "views.units_with_dispatch_status";

/** Every dispatch path that gates on unit state. */
const GATES = [
  "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts",
  "apps/backend/src/dispatch/assignments/quicksave.service.ts",
  "apps/backend/src/dispatch/book-load.service.ts",
  "apps/backend/src/dispatch/quick-assign.service.ts",
  "apps/backend/src/dispatch/loads.routes.ts",
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/--[^\n]*/g, "");
}

export function auditGate(rel, srcRaw) {
  const problems = [];
  const src = stripComments(srcRaw);
  if (!src.includes(VIEW)) return problems; // does not use the view at all — nothing to constrain

  // 1. The view must never be the driving table via an INNER JOIN. `FROM <view> v JOIN …` means a
  //    dead view yields no row, and every gate downstream of that row silently stops evaluating.
  const innerJoinFromView = new RegExp(`FROM\\s+${VIEW.replace(".", "\\.")}\\s+\\w+\\s*\\n?\\s*(?!LEFT|RIGHT|FULL)JOIN`, "i");
  if (innerJoinFromView.test(src)) {
    problems.push(
      `${rel}: drives its unit row FROM ${VIEW} with an INNER JOIN. That view is a dead stub on prod ` +
        `(WHERE false, 0 rows), so the join yields nothing and the gate below it never evaluates — an ` +
        `OOS unit passes. Drive FROM mdata.units and LEFT JOIN the view for advisory columns only.`
    );
  }

  // 2. A bare `FROM <view>` as the sole source is the same defect without a join.
  const bareFromView = new RegExp(`FROM\\s+${VIEW.replace(".", "\\.")}\\s*\\n\\s*WHERE`, "i");
  if (bareFromView.test(src)) {
    problems.push(
      `${rel}: selects the unit row solely FROM ${VIEW}, which returns 0 rows on prod. Any gate read ` +
        `from that row is inert (null-safe access makes it fail OPEN). Drive FROM mdata.units.`
    );
  }

  // 3. Where the file gates on OOS, is_oos must come from mdata.units, not from the view.
  if (/is_oos/i.test(src)) {
    const fromUnits = /COALESCE\(\s*u\.is_oos|COALESCE\(is_oos|u\.is_oos/i.test(src);
    if (!fromUnits) {
      problems.push(
        `${rel}: reads is_oos but not from mdata.units. mdata.units is the authority for out-of-` +
          `service state; ${VIEW} does not even expose the column.`
      );
    }
  }

  // 4. Unit scoping must be lease-aware. mdata.units has no operating_company_id.
  if (/FROM\s+mdata\.units/i.test(src)) {
    const leaseAware = /currently_leased_to_company_id\s*,\s*[\w.]*owner_company_id|owner_company_id\s*,\s*[\w.]*currently_leased_to_company_id/i.test(src);
    if (!leaseAware) {
      problems.push(
        `${rel}: reads mdata.units without lease-aware entity scoping ` +
          `(COALESCE(currently_leased_to_company_id, owner_company_id)). All 13 OOS units on prod are ` +
          `TRK-OWNED and LEASED TO TRANSP — scoping any other way makes them invisible to the ` +
          `operating entity that dispatches them.`
      );
    }
  }
  return problems;
}

export function auditDispatchStatusRoute(src) {
  const problems = [];
  const route = src.match(/app\.get\(["']\/api\/v1\/dispatch\/units\/:unit_id\/dispatch-status["'][\s\S]*?app\.get\(["']\/api\/v1\/dispatch\/units\/:unit_id\/insurance-status["']/)?.[0] ?? "";
  if (!route) return ["loads.routes.ts: mounted unit dispatch-status route missing"];
  if (/\.catch\s*\(/.test(route)) problems.push("loads.routes.ts: dispatch-status must not mask query failures with catch fallback");
  if (!/FROM\s+mdata\.units\s+u/i.test(route)) problems.push("loads.routes.ts: dispatch-status must drive from mdata.units");
  if (!/COALESCE\(u\.currently_leased_to_company_id,\s*u\.owner_company_id\)\s*=\s*\$2::uuid/.test(route)) problems.push("loads.routes.ts: dispatch-status must enforce lease-aware selected-company scope");
  if (!/COALESCE\(u\.is_oos,\s*false\)\s+AS\s+is_oos/i.test(route)) problems.push("loads.routes.ts: dispatch-status must read canonical mdata.units.is_oos");
  if (!/is_blocked:\s*Boolean\(row\.is_dispatch_blocked\)\s*\|\|\s*Boolean\(row\.is_oos\)/.test(route)) problems.push("loads.routes.ts: dispatch-status response must block canonical OOS units");
  return problems;
}

function auditTree() {
  const problems = [];
  for (const rel of GATES) {
    problems.push(...auditGate(rel, readFileSync(join(ROOT, rel), "utf8")));
  }
  problems.push(...auditDispatchStatusRoute(readFileSync(join(ROOT, "apps/backend/src/dispatch/loads.routes.ts"), "utf8")));
  return problems;
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);

  // case1 — the DISP-F01 defect verbatim.
  const bug = `const r = await client.query(\`
      SELECT v.display_id, COALESCE(u.is_oos,false) AS is_oos
      FROM views.units_with_dispatch_status v
      JOIN mdata.units u ON u.id = v.id
      WHERE v.id = $1 AND v.operating_company_id = $2\`);`;
  if (!auditGate("g.ts", bug).some((p) => p.includes("INNER JOIN")))
    failures.push("case1 FAIL — INNER JOIN driven from the dead view was NOT caught");

  // case2 — the book-load shape: the view as the sole source.
  const bare = `const r = await optionalQuery(client, \`
      SELECT id, is_dispatch_blocked
      FROM views.units_with_dispatch_status
      WHERE id = $1\`);`;
  if (!auditGate("g.ts", bare).some((p) => p.includes("solely FROM")))
    failures.push("case2 FAIL — a bare FROM <dead view> was NOT caught");

  // case3 — the FIX must pass.
  const fixed = `const r = await client.query(\`
      SELECT COALESCE(u.is_oos,false) AS is_oos
      FROM mdata.units u
      LEFT JOIN views.units_with_dispatch_status v ON v.id = u.id
      WHERE u.id = $1 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2\`);`;
  if (auditGate("g.ts", fixed).length !== 0)
    failures.push(`case3 FAIL — the corrected form was wrongly flagged: ${auditGate("g.ts", fixed).join(" | ")}`);

  // case4 — correct join, but entity scoping that hides leased units.
  const notLeaseAware = `const r = await client.query(\`
      SELECT COALESCE(u.is_oos,false) AS is_oos
      FROM mdata.units u
      LEFT JOIN views.units_with_dispatch_status v ON v.id = u.id
      WHERE u.id = $1 AND u.owner_company_id = $2\`);`;
  if (!auditGate("g.ts", notLeaseAware).some((p) => p.includes("lease-aware")))
    failures.push("case4 FAIL — owner-only scoping (which hides every OOS unit) was NOT caught");

  const statusFixture = `app.get("/api/v1/dispatch/units/:unit_id/dispatch-status", async () => {
    const res = await client.query(\`SELECT COALESCE(u.is_oos, false) AS is_oos FROM mdata.units u LEFT JOIN views.units_with_dispatch_status v ON v.id = u.id WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid\`);
    return { is_blocked: Boolean(row.is_dispatch_blocked) || Boolean(row.is_oos) };
  }); app.get("/api/v1/dispatch/units/:unit_id/insurance-status", async () => {});`;
  if (auditDispatchStatusRoute(statusFixture).length) failures.push(`case5 FAIL — corrected dispatch-status fixture rejected: ${auditDispatchStatusRoute(statusFixture).join(" | ")}`);
  if (!auditDispatchStatusRoute(statusFixture.replace(");\n    return", ").catch(() => ({ rows: [] }));\n    return")).some((p) => p.includes("catch fallback"))) failures.push("case6 FAIL — catch-to-empty dispatch-status mutation was NOT caught");
  if (!auditDispatchStatusRoute(statusFixture.replace("FROM mdata.units u", "FROM views.units_with_dispatch_status u")).some((p) => p.includes("drive from mdata.units"))) failures.push("case7 FAIL — view-driven dispatch-status mutation was NOT caught");
  if (!auditDispatchStatusRoute(statusFixture.replace("Boolean(row.is_dispatch_blocked) || Boolean(row.is_oos)", "Boolean(row.is_dispatch_blocked)")).some((p) => p.includes("block canonical OOS"))) failures.push("case8 FAIL — OOS response mutation was NOT caught");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — INNER JOIN on the dead view caught, bare FROM caught, corrected form ` +
      `passes, owner-only scoping caught`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every dispatch gate reads is_oos from mdata.units and cannot be disabled by a dead view`);
}

main();
