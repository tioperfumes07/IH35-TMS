#!/usr/bin/env node
/**
 * LOAD-SM-01 — the load status state machine is defined ONCE, and the GPS auto-switch writer
 * consults it before moving a load.
 *
 * WHY THIS EXISTS (verified on origin/main 6c6f9c49b0, 2026-08-01):
 *
 * 1. TWO COPIES OF THE STATE MACHINE. `dispatch/load-state-machine.ts` exports dispatchStatusSchema,
 *    fromMdataStatus, toMdataStatus and the allowedTransitions table. `dispatch/loads.routes.ts` — the
 *    office transition endpoint, and the only caller of the revenue-recognition latch — redefined ALL
 *    FOUR privately and validated against its own copy. Normalised comparison proved the two were
 *    byte-equivalent at the time, which is precisely why this was invisible: nothing was broken YET.
 *    A duplicated transition table is a drift generator, and since DISP-01 this table decides when
 *    revenue is recognized. Two copies means a future edit to one of them silently changes what the
 *    other permits.
 *
 * 2. THE GPS WRITER BYPASSED IT ENTIRELY. `integrations/samsara/auto-status-switch/detector.service.ts`
 *    ran `UPDATE mdata.loads SET status = $2` with no validator call at all. Its only protection was
 *    its caller's SELECT filter (listActiveLoadsForAutoStatus: status IN ('at_pickup','in_transit')).
 *    That filter is correct today, so the reachable behaviour was safe — but the control lived in the
 *    caller, not in the writer, so widening the filter or calling applyAutoSwitch from anywhere else
 *    would let a telematics ping move a load with no state check.
 *
 * 3. THE EXISTING GUARD DID NOT COVER THIS. `verify-auto-status-no-direct-status-write.mjs` asserts
 *    "must never write mdata.loads.status directly" against ONE path:
 *    apps/backend/src/telematics/auto-status.service.ts — the suggestion-only service that already
 *    complies and never wrote status in the first place. The file that actually did the direct write
 *    was outside its scope. That guard was green while the thing its name describes was true
 *    somewhere else. Its narrow assertion is still valid and still runs; THIS guard covers the class.
 *
 * WHAT WOULD SILENTLY REGRESS THIS: re-inlining a local allowedTransitions during a conflict
 * resolution (the union merge driver restores deleted blocks — see the repo's own union-merge
 * landmine), or dropping the validator call from applyAutoSwitch to "let the cron catch up".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = "apps/backend/src";
const CANONICAL = "apps/backend/src/dispatch/load-state-machine.ts";
const DETECTOR = "apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts";
const LABEL = "verify-load-status-single-state-machine";

/** The pieces that together ARE the state machine. Any second definition is a fork. */
const SM_DEFINITIONS = [
  { name: "allowedTransitions", re: /(?:^|\n)\s*(?:export\s+)?const\s+allowedTransitions\s*[:=]/g },
  { name: "dispatchStatusSchema", re: /(?:^|\n)\s*(?:export\s+)?const\s+dispatchStatusSchema\s*=/g },
  { name: "fromMdataStatus", re: /(?:^|\n)\s*(?:export\s+)?function\s+fromMdataStatus\s*\(/g },
  { name: "toMdataStatus", re: /(?:^|\n)\s*(?:export\s+)?function\s+toMdataStatus\s*\(/g },
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Where the GPS writer's status UPDATE lives, and whether a validator guards it. */
export function auditDetector(src) {
  const problems = [];
  const code = stripComments(src);
  const write = /UPDATE\s+mdata\.loads\s+SET\s+status/i.exec(code);
  if (!write) return problems; // no status write here → nothing to guard
  if (!/validateLoadStopStatusWrite|validateLoadStatusTransition/.test(code)) {
    problems.push(
      `${DETECTOR} writes mdata.loads.status with NO state-machine validation. A GPS reading is not ` +
        `authority to move a load — its only protection is the caller's SELECT filter, which is not a control.`
    );
    return problems;
  }
  // The validator must run BEFORE the write, not after it.
  const iValidate = code.search(/validateLoadStopStatusWrite|validateLoadStatusTransition/);
  if (iValidate > write.index) {
    problems.push(`${DETECTOR} validates AFTER the status UPDATE — the row is already changed by then.`);
  }
  if (!/UPDATE\s+mdata\.loads[\s\S]{0,300}AND\s+operating_company_id\s*=\s*\$3::uuid[\s\S]{0,100}RETURNING\s+id/i.test(code)) {
    problems.push(`${DETECTOR} status UPDATE must bind the selected company and return the changed row.`);
  }
  if (!/if\s*\(!statusUpdate\.rows\[0\]\?\.id\)\s*return\s*\{\s*applied:\s*false,\s*skipped:\s*["']load_not_found["']\s*\}/.test(code)) {
    problems.push(`${DETECTOR} must stop before event/audit writes when the scoped status UPDATE changes no row.`);
  }
  return problems;
}

/**
 * Scope by DOMAIN, not by identifier name. `maintenance/work-orders.routes.ts` legitimately owns a
 * const named `allowedTransitions` for the WORK-ORDER machine (open/in_progress/waiting_parts/
 * complete/cancelled) — a different domain that happens to pick the same obvious variable name.
 * Flagging it would be a false positive, and a guard that cries wolf gets bypassed. A definition is
 * part of the LOAD machine only if it mentions a load-specific status member.
 */
const LOAD_DOMAIN_MARKERS = /delivered_pending_docs|completed_docs_received|driver_walkoff/;

/**
 * Domain is decided per FILE, not per definition. Verified discrimination on the real tree:
 * maintenance/work-orders.routes.ts = 0 load markers, dispatch/load-state-machine.ts = 16,
 * dispatch/loads.routes.ts = 6. Testing the extracted definition text instead was tried and is
 * fragile — `function fromMdataStatus(status: string): DispatchStatus` puts the only marker AFTER
 * the parameter list, so any bracket-balanced extraction stops short of it and the guard reports
 * "defined nowhere." A guard whose scoping depends on where a return type sits fails open.
 */
export function isLoadDomainFile(code) {
  return LOAD_DOMAIN_MARKERS.test(code);
}

/** Every state-machine piece must have exactly one definition, and it must be the canonical file. */
export function auditDuplicates(files) {
  const problems = [];
  for (const { name, re } of SM_DEFINITIONS) {
    const owners = [];
    for (const { rel, code } of files) {
      if (!isLoadDomainFile(code)) continue;
      re.lastIndex = 0;
      if (re.test(code)) owners.push(rel);
    }
    if (owners.length === 0) {
      problems.push(`${name} is defined nowhere — the state machine is missing.`);
      continue;
    }
    if (owners.length > 1) {
      problems.push(
        `${name} is defined in ${owners.length} files (${owners.join(", ")}). The load state machine ` +
          `must have ONE definition in ${CANONICAL}; a second copy silently drifts, and since DISP-01 ` +
          `this table decides when revenue is recognized.`
      );
      continue;
    }
    if (owners[0] !== CANONICAL) {
      problems.push(`${name} is defined in ${owners[0]}, not the canonical ${CANONICAL}.`);
    }
  }
  return problems;
}

function auditTree() {
  const files = walk(join(ROOT, SRC)).map((full) => ({
    rel: relative(ROOT, full),
    code: stripComments(readFileSync(full, "utf8")),
  }));
  return [...auditDuplicates(files), ...auditDetector(readFileSync(join(ROOT, DETECTOR), "utf8"))];
}

function selftest() {
  const failures = [];
  // A canonical fixture must carry a load-domain marker, or file-level scoping correctly ignores it.
  const SM_FIXTURE =
    'export const allowedTransitions = { in_transit: ["delivered_pending_docs"] };\n' +
    "export const dispatchStatusSchema = z.enum([]);\n" +
    "export function fromMdataStatus(s) {}\n" +
    "export function toMdataStatus(s) {}";

  // case1 — the detector's pre-fix shape: a bare UPDATE with no validator.
  const detectorPreFix = `
    const ctx = await fetchLoadGpsContext(client, operatingCompanyId, loadUuid);
    if (!ctx) return { applied: false, skipped: "missing_gps_context" };
    await client.query("UPDATE mdata.loads SET status = $2, updated_at = now() WHERE id = $1::uuid", [loadUuid, newStatus]);
  `;
  if (auditDetector(detectorPreFix).length === 0)
    failures.push("case1 FAIL — an unvalidated GPS status write was NOT caught");

  // case2 — validated, correct order.
  const detectorFixed = `
    const transition = validateLoadStopStatusWrite(current.status, newStatus);
    if (!transition.ok) return { applied: false, skipped: "invalid_load_state" };
    const statusUpdate = await client.query("UPDATE mdata.loads SET status = $2 WHERE id = $1::uuid AND operating_company_id = $3::uuid RETURNING id", [loadUuid, newStatus, operatingCompanyId]);
    if (!statusUpdate.rows[0]?.id) return { applied: false, skipped: "load_not_found" };
  `;
  if (auditDetector(detectorFixed).length !== 0)
    failures.push(`case2 FAIL — the fixed detector was flagged: ${auditDetector(detectorFixed).join(" | ")}`);

  // case2b — state validation alone is insufficient if the canonical write drops company scope.
  const detectorUnscoped = detectorFixed
    .replace(" AND operating_company_id = $3::uuid RETURNING id", " RETURNING id");
  if (!auditDetector(detectorUnscoped).some((p) => p.includes("bind the selected company")))
    failures.push("case2b FAIL — a UUID-only GPS status write was NOT caught");

  // case2c — a scoped write must be checked before emitting event/audit evidence.
  const detectorUnchecked = detectorFixed
    .replace('if (!statusUpdate.rows[0]?.id) return { applied: false, skipped: "load_not_found" };', "");
  if (!auditDetector(detectorUnchecked).some((p) => p.includes("changes no row")))
    failures.push("case2c FAIL — an unchecked scoped GPS status write was NOT caught");

  // case3 — validated but AFTER the write: the row already moved.
  const detectorAfter = `
    const statusUpdate = await client.query("UPDATE mdata.loads SET status = $2 WHERE id = $1::uuid AND operating_company_id = $3::uuid RETURNING id", [loadUuid, newStatus, operatingCompanyId]);
    if (!statusUpdate.rows[0]?.id) return { applied: false, skipped: "load_not_found" };
    const transition = validateLoadStopStatusWrite(current.status, newStatus);
  `;
  if (!auditDetector(detectorAfter).some((p) => p.includes("validates AFTER")))
    failures.push("case3 FAIL — validation-after-write was NOT caught");

  // case4 — a second copy of the transition table.
  const forked = [
    { rel: CANONICAL, code: SM_FIXTURE },
    { rel: "apps/backend/src/dispatch/loads.routes.ts", code: 'const allowedTransitions = { in_transit: ["delivered_pending_docs"] };' },
  ];
  if (!auditDuplicates(forked).some((p) => p.includes("is defined in 2 files")))
    failures.push("case4 FAIL — a duplicated allowedTransitions table was NOT caught");

  // case5 — single canonical definition set is clean.
  const single = [
    { rel: CANONICAL, code: SM_FIXTURE },
    { rel: "apps/backend/src/dispatch/loads.routes.ts", code: 'import { allowedTransitions } from "./load-state-machine.js"; // delivered_pending_docs' },
  ];
  if (auditDuplicates(single).length !== 0)
    failures.push(`case5 FAIL — a clean single definition was flagged: ${auditDuplicates(single).join(" | ")}`);

  // case6 — the real tree must be clean (proves the fix is actually in place).
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case6 FAIL — real sources flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — unvalidated GPS write caught, validate-after-write caught, ` +
      `forked transition table caught, single canonical definition clean`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — one load state machine in ${CANONICAL}, and the GPS auto-switch writer validates ` +
      `against it before moving a load`
  );
}

main();
