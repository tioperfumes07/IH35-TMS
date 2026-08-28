#!/usr/bin/env node
/**
 * TASK-XTENANT-SCOPE — GO-0020 leftover-unique (500/dead/silent), scope /tasks (part of
 * /reports /cash-flow /finance /tasks).
 *
 * tasks.task has NO Row-Level Security: confirmed against every migration touching the `tasks`
 * schema — the table is only ever GRANTed SELECT/INSERT/UPDATE/DELETE, never
 * `ALTER TABLE tasks.task ENABLE ROW LEVEL SECURITY`. The SET_TASK_SCOPE_SQL GUCs every route in
 * task.routes.ts sets are therefore a complete no-op for this specific table — the ONLY tenant
 * isolation is whatever operating_company_id filter the application SQL itself supplies.
 *
 * apps/backend/src/tasks/task.routes.ts had 8 single-task lookups (GET /:id, PATCH /:id/status x2
 * queries, PATCH /:id/progress, GET /:id/links x2 queries, POST /:id/links x2 queries,
 * GET /:id/comments, POST /:id/comments, GET /:id/activity) that filtered ONLY by task_id, with
 * zero operating_company_id check — a same-install user authenticated under company A could read
 * or mutate company B's task by task_id alone. Live-confirmed on Neon: multiple companies
 * (TRANSP, USMCA) have real task rows today, so this is a live gap, not a theoretical one.
 *
 * This guard anchors on the SPECIFIC fixed sites (short single-line substrings, not a generic
 * file-wide heuristic) — a broad scan for "every tasks.task reference near operating_company_id"
 * false-positives against legitimate, already-correctly-scoped, pre-existing queries elsewhere in
 * this same file (the list/planner endpoints' long JOIN chains and correlated EXISTS subqueries),
 * which were never part of this defect and don't need re-proving here.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TASK_ROUTES_FILE = "apps/backend/src/tasks/task.routes.ts";

const REQUIRED_ANCHORS = [
  "`SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid`,", // shared shape: /status, GET /:id/links, /comments GET+POST, /activity existence checks
  "WHERE task_id = $2 AND operating_company_id = $3::uuid RETURNING *`;", // PATCH /:id/status UPDATE
  "WHERE t.task_id = $1 AND t.operating_company_id = $2::uuid AND t.is_active = true", // GET /:id
  "FROM tasks.task_link WHERE task_id = $1 AND operating_company_id = $2::uuid AND is_active = true", // GET /:id/links task_link read
  "`SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid AND is_active = true`,", // POST /:id/links existsRes
  "WHERE task_id = $1 AND operating_company_id = $3::uuid AND status <> 'completed'", // POST /:id/links completion UPDATE
  "WHERE task_id = $2 AND operating_company_id = $3::uuid RETURNING task_id, progress_pct", // PATCH /:id/progress
];

// The shared existsRes anchor's own literal string appears identically at 4 sites (PATCH /:id/status,
// GET /:id/links, GET /:id/comments, POST /:id/comments, GET /:id/activity = 5 actually, since
// PATCH /:id/status was rewritten to the same shape) — count occurrences, don't just check presence.
const SHARED_EXISTS_ANCHOR = "`SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid`,";
const SHARED_EXISTS_MIN_COUNT = 5;

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(srcRaw) {
  const src = stripLineComments(srcRaw);
  const failures = [];

  for (const anchor of REQUIRED_ANCHORS) {
    if (!src.includes(anchor)) {
      failures.push(`${TASK_ROUTES_FILE}: expected company-scoped anchor not found — a TASK-XTENANT-SCOPE fix site may have been reverted: ${JSON.stringify(anchor)}`);
    }
  }

  const sharedCount = src.split(SHARED_EXISTS_ANCHOR).length - 1;
  if (sharedCount < SHARED_EXISTS_MIN_COUNT) {
    failures.push(`${TASK_ROUTES_FILE}: only ${sharedCount} scoped single-task existence checks found (shared shape), expected at least ${SHARED_EXISTS_MIN_COUNT} — a TASK-XTENANT-SCOPE fix site may have been reverted`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, TASK_ROUTES_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: tasks-cross-tenant-scope");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: all tasks.task single-record fix sites stay company-scoped");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender: strip the operating_company_id filter from the GET /:id query only.
  const offender = src.replace(
    "WHERE t.task_id = $1 AND t.operating_company_id = $2::uuid AND t.is_active = true",
    "WHERE t.task_id = $1 AND t.is_active = true"
  );
  if (offender === src) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (GET /:id company filter removed) was NOT caught");
    process.exit(1);
  }

  // Offender B: revert ONE occurrence of the shared existsRes anchor (simulate a partial revert
  // that drops the count below the required floor while other anchors stay intact).
  const offenderB = src.replace(SHARED_EXISTS_ANCHOR, "`SELECT task_id FROM tasks.task WHERE task_id = $1`,");
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender B (one shared existsRes site reverted, count regression) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
