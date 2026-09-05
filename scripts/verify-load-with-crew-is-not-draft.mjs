#!/usr/bin/env node
/**
 * verify-load-with-crew-is-not-draft.mjs
 *
 * Owner spec 09-04-2026/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL(-Updated).md §1.1,
 * step 1 of the 2026-09-05 strict-sequence order (DURABLE fix, not the original single-path one):
 * "The book/assign write path applies the same rule as the Edit PATCH: a load that ends any write
 * with an assigned unit + primary driver (or team)... can never be draft. A self-heal so any load
 * already sitting in that state advances without waiting for a human edit."
 *
 * Defect (proven live, 2026-09-04): load 13508 sat at status='draft' while carrying an assigned
 * primary driver, an OPEN driver bill, and a proforma invoice. The original fix
 * (update-load.service.ts's WIZ-STATUS-01) only covered the general Edit-Load PATCH path. Live
 * investigation 2026-09-05 found FOUR separate write paths that assign a primary driver/unit/team
 * straight to mdata.loads via their own UPDATE, all bypassing that fix: quick-assign.service.ts,
 * assignments/quicksave.service.ts (x2: reassignDriver + reassignUnit), dispatch-refinements.service.ts,
 * planner.service.ts. This guard checks all five write paths PLUS the self-heal backstop.
 */
import { readFileSync } from "node:fs";

const UPDATE_LOAD_PATH = "apps/backend/src/dispatch/update-load.service.ts";
const SHARED_HELPER_PATH = "apps/backend/src/dispatch/draft-crew-status-advance.ts";
const SELFHEAL_CRON_PATH = "apps/backend/src/cron/draft-crew-status-selfheal.cron.ts";
const INDEX_PATH = "apps/backend/src/index.ts";
const ADDITIONAL_WRITE_PATHS = [
  "apps/backend/src/dispatch/quick-assign.service.ts",
  "apps/backend/src/dispatch/assignments/quicksave.service.ts",
  "apps/backend/src/dispatch/dispatch-refinements.service.ts",
  "apps/backend/src/dispatch/planner.service.ts",
];

function violations(files) {
  const errors = [];
  const updateLoadSrc = files[UPDATE_LOAD_PATH];

  // 1) The original Edit-Load PATCH fix must still be present (never-delete-only-add).
  if (!/String\(old\.status[^)]*\)\s*===\s*"draft"/.test(updateLoadSrc)) {
    errors.push("update-load.service.ts: the status advance is not gated on the load currently being a 'draft'");
  }
  if (!/effectivePrimaryDriver\s*\|\|\s*effectiveTeam/.test(updateLoadSrc)) {
    errors.push("update-load.service.ts: the advance does not require the edit to end with a committed driver or team");
  }
  if (!/add\("status",\s*"assigned_not_dispatched"/.test(updateLoadSrc)) {
    errors.push("update-load.service.ts: a crewed draft load is not advanced to 'assigned_not_dispatched'");
  }
  if (!/assigned_not_dispatched"[^\n]*::mdata\.load_status_enum/.test(updateLoadSrc)) {
    errors.push("update-load.service.ts: the status advance does not cast to ::mdata.load_status_enum");
  }
  if (/add\("status",\s*"dispatched"/.test(updateLoadSrc)) {
    errors.push("FORBIDDEN: update-load.service.ts sets status='dispatched' -- dispatch is its own action, never the edit path's");
  }

  // 2) The shared, durable helper must exist and never claim 'dispatched' either.
  const helperSrc = files[SHARED_HELPER_PATH];
  if (!helperSrc) {
    errors.push(`missing shared helper: ${SHARED_HELPER_PATH}`);
  } else {
    if (!/status\s*!==\s*"draft"/.test(helperSrc) && !helperSrc.includes('load.status !== "draft"')) {
      errors.push("draft-crew-status-advance.ts: the advance is not gated on the load currently being 'draft'");
    }
    if (!helperSrc.includes("assigned_not_dispatched")) {
      errors.push("draft-crew-status-advance.ts: does not advance to 'assigned_not_dispatched'");
    }
    if (/SET\s+status\s*=\s*'dispatched'/i.test(helperSrc)) {
      errors.push("FORBIDDEN: draft-crew-status-advance.ts sets status='dispatched' -- it must only ever set assigned_not_dispatched");
    }
  }

  // 3) Every one of the four additional write paths must call the shared helper.
  for (const path of ADDITIONAL_WRITE_PATHS) {
    const src = files[path];
    if (!src) { errors.push(`missing file: ${path}`); continue; }
    if (!src.includes("advanceDraftStatusIfCrewed")) {
      errors.push(`${path}: does not call advanceDraftStatusIfCrewed after assigning a driver/unit/team -- a draft load crewed through this path would stay draft`);
    }
  }

  // 4) The self-heal cron must exist, scope RLS per company, gate on draft+crewed/open-bill/proforma,
  //    advance only to assigned_not_dispatched, and be registered at boot.
  const selfHealSrc = files[SELFHEAL_CRON_PATH];
  if (!selfHealSrc) {
    errors.push(`missing self-heal cron: ${SELFHEAL_CRON_PATH}`);
  } else {
    if (!selfHealSrc.includes("l.status = 'draft'")) errors.push("self-heal cron does not scope to status='draft'");
    if (!selfHealSrc.includes("driver_bills") || !selfHealSrc.includes("proforma")) {
      errors.push("self-heal cron does not check open driver bills / proforma invoices as advance triggers");
    }
    if (!selfHealSrc.includes("assigned_not_dispatched")) errors.push("self-heal cron does not advance to assigned_not_dispatched");
    if (selfHealSrc.includes("'dispatched'") && !selfHealSrc.includes("driver_no_show")) {
      // narrow: only forbid an actual assignment to 'dispatched', not incidental mentions
      if (/SET\s+status\s*=\s*'dispatched'/i.test(selfHealSrc)) {
        errors.push("FORBIDDEN: self-heal cron sets status='dispatched' -- it must only ever set assigned_not_dispatched");
      }
    }
  }
  const indexSrc = files[INDEX_PATH];
  if (!indexSrc || !indexSrc.includes("initializeDraftCrewStatusSelfHealCron")) {
    errors.push("apps/backend/src/index.ts does not register initializeDraftCrewStatusSelfHealCron at boot");
  }

  return errors;
}

function check(files) {
  const errors = violations(files);
  if (errors.length) throw new Error(errors.join("; "));
}

function loadAll() {
  const files = {};
  for (const path of [UPDATE_LOAD_PATH, SHARED_HELPER_PATH, SELFHEAL_CRON_PATH, INDEX_PATH, ...ADDITIONAL_WRITE_PATHS]) {
    try { files[path] = readFileSync(path, "utf8"); } catch { /* reported as missing above */ }
  }
  return files;
}

const files = loadAll();

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const base = files;
  const mutations = [
    { ...base, [UPDATE_LOAD_PATH]: base[UPDATE_LOAD_PATH].replace('String(old.status ?? "") === "draft"', "false") },
    { ...base, [UPDATE_LOAD_PATH]: base[UPDATE_LOAD_PATH].replace("effectivePrimaryDriver || effectiveTeam", "false") },
    { ...base, [UPDATE_LOAD_PATH]: base[UPDATE_LOAD_PATH].replace('add("status", "assigned_not_dispatched", "::mdata.load_status_enum");', "") },
    { ...base, [UPDATE_LOAD_PATH]: `${base[UPDATE_LOAD_PATH]}\n  add("status", "dispatched", "::mdata.load_status_enum");` },
    { ...base, [SHARED_HELPER_PATH]: undefined },
    { ...base, [SHARED_HELPER_PATH]: base[SHARED_HELPER_PATH].replaceAll("assigned_not_dispatched", "removed") },
    { ...base, [SHARED_HELPER_PATH]: base[SHARED_HELPER_PATH].replace("SET status = 'assigned_not_dispatched'", "SET status = 'dispatched'") },
    { ...base, [ADDITIONAL_WRITE_PATHS[0]]: base[ADDITIONAL_WRITE_PATHS[0]].replaceAll("advanceDraftStatusIfCrewed", "removed") },
    { ...base, [ADDITIONAL_WRITE_PATHS[1]]: base[ADDITIONAL_WRITE_PATHS[1]].replaceAll("advanceDraftStatusIfCrewed", "removed") },
    { ...base, [ADDITIONAL_WRITE_PATHS[2]]: base[ADDITIONAL_WRITE_PATHS[2]].replaceAll("advanceDraftStatusIfCrewed", "removed") },
    { ...base, [ADDITIONAL_WRITE_PATHS[3]]: base[ADDITIONAL_WRITE_PATHS[3]].replaceAll("advanceDraftStatusIfCrewed", "removed") },
    { ...base, [SELFHEAL_CRON_PATH]: undefined },
    { ...base, [SELFHEAL_CRON_PATH]: base[SELFHEAL_CRON_PATH].replace("l.status = 'draft'", "TRUE") },
    { ...base, [SELFHEAL_CRON_PATH]: base[SELFHEAL_CRON_PATH].replaceAll("assigned_not_dispatched", "removed") },
    { ...base, [INDEX_PATH]: base[INDEX_PATH].replaceAll("initializeDraftCrewStatusSelfHealCron", "removed") },
  ];
  for (const [index, mutated] of mutations.entries()) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  check(files);
  console.log(`PASS verify-load-with-crew-is-not-draft --selftest (${caught}/${mutations.length})`);
} else {
  check(files);
  console.log("PASS verify-load-with-crew-is-not-draft (all 5 write paths + self-heal advance a crewed load out of draft)");
}
