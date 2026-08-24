#!/usr/bin/env node
/**
 * TASK-ID-SCOPE-FIX — every :id-scoped task route (status/detail/links/progress/comments/activity)
 * tried to bootstrap its RLS scope by reading `tasks.task` UNSCOPED first ("SELECT operating_company_id
 * FROM tasks.task WHERE task_id = $1"), but tasks.task is FORCE RLS on `app.current_operating_company_id`
 * — that same unscoped read is itself blocked, so it always returned zero rows and every one of these
 * routes 404'd "Task not found" for every real task, always (live-confirmed: GET/POST .../comments,
 * GET .../activity, GET /:id, GET .../links all 404 on a task visible on the Task Board). The fix
 * requires `operating_company_id` as an explicit query param (the same pattern every OTHER route in
 * this file already uses) and sets the RLS scope from it BEFORE any tasks.* query — a caller passing
 * the wrong company still gets a correct 404 via RLS, not cross-tenant access.
 */
import fs from "node:fs";

const BACKEND_FILE = "apps/backend/src/tasks/task.routes.ts";
const FRONTEND_API_FILE = "apps/frontend/src/api/tasks.ts";
const FRONTEND_PAGE_FILE = "apps/frontend/src/pages/tasks/TasksChatPage.tsx";

const BROKEN_PATTERN = "SELECT operating_company_id FROM tasks.task WHERE task_id = $1`";

// [routeMarker, mustReferenceTasksTable] — the route registration string that opens each handler,
// and whether the handler body queries a tasks.* table at all (all seven do).
const ROUTES = [
  `fastify.patch("/:id/status"`,
  `fastify.get("/:id", async`,
  `fastify.get("/:id/links"`,
  `fastify.post("/:id/links"`,
  `fastify.patch("/:id/progress"`,
  `fastify.get("/:id/comments"`,
  `fastify.post("/:id/comments"`,
  `fastify.get("/:id/activity"`,
];

function routeBlock(src, marker, nextMarkers) {
  const start = src.indexOf(marker);
  if (start === -1) return null;
  let end = src.length;
  for (const next of nextMarkers) {
    const idx = src.indexOf(next, start + marker.length);
    if (idx !== -1 && idx < end) end = idx;
  }
  return src.slice(start, end);
}

function auditBackend(src) {
  const failures = [];
  const need = (cond, msg) => { if (!cond) failures.push(msg); };

  need(!src.includes(BROKEN_PATTERN), "broken unscoped-lookup-before-scope pattern must be fully removed");
  need(src.includes("const TaskScopeQuerySchema"), "TaskScopeQuerySchema must be defined");

  for (let i = 0; i < ROUTES.length; i++) {
    const marker = ROUTES[i];
    const block = routeBlock(src, marker, ROUTES.filter((m) => m !== marker));
    need(block !== null, `route not found: ${marker}`);
    if (!block) continue;
    need(block.includes("TaskScopeQuerySchema.safeParse"), `${marker} must validate operating_company_id via TaskScopeQuerySchema`);
    need(block.includes("scopeParsed.success"), `${marker} must reject on missing/invalid operating_company_id`);
    // Scope must be set BEFORE any query against a tasks.* table.
    const scopeIdx = block.indexOf("SET_TASK_SCOPE_SQL");
    const firstTaskTableQuery = Math.min(
      ...["tasks.task ", "tasks.task WHERE", "tasks.task_comments", "tasks.task_activity", "tasks.task_link"]
        .map((t) => { const idx = block.indexOf(t); return idx === -1 ? Infinity : idx; })
    );
    need(scopeIdx !== -1 && scopeIdx < firstTaskTableQuery, `${marker} must call SET_TASK_SCOPE_SQL before querying any tasks.* table`);
  }
  return failures;
}

function auditFrontendApi(src) {
  const failures = [];
  const need = (cond, msg) => { if (!cond) failures.push(msg); };
  const fns = [
    ["fetchTaskComments", "/comments?"],
    ["createTaskComment", "/comments?"],
    ["fetchTaskActivity", "/activity?"],
    ["fetchTaskLinks", "/links?"],
    ["createTaskLink", "/links?"],
    ["updateTaskProgress", "/progress?"],
  ];
  for (const [name, urlFragment] of fns) {
    const start = src.indexOf(`export async function ${name}(`);
    need(start !== -1, `${name} must be exported`);
    if (start === -1) continue;
    const end = src.indexOf("\n}", start);
    const body = src.slice(start, end === -1 ? undefined : end);
    need(body.includes("operating_company_id"), `${name} must accept and forward operating_company_id`);
    need(body.includes(urlFragment) || body.includes("URLSearchParams"), `${name} must scope its URL by operating_company_id`);
  }
  return failures;
}

function auditFrontendPage(src) {
  const failures = [];
  const need = (cond, msg) => { if (!cond) failures.push(msg); };
  need(/fetchTaskComments\(activeTaskId, companyId/.test(src), "TasksChatPage must pass companyId to fetchTaskComments");
  need(/fetchTaskActivity\(activeTaskId, companyId/.test(src), "TasksChatPage must pass companyId to fetchTaskActivity");
  need(/createTaskComment\(activeTaskId, companyId/.test(src), "TasksChatPage must pass companyId to createTaskComment");
  return failures;
}

const backendSrc = fs.readFileSync(BACKEND_FILE, "utf8");
const apiSrc = fs.readFileSync(FRONTEND_API_FILE, "utf8");
const pageSrc = fs.readFileSync(FRONTEND_PAGE_FILE, "utf8");

const failures = [
  ...auditBackend(backendSrc).map((m) => `[backend] ${m}`),
  ...auditFrontendApi(apiSrc).map((m) => `[api] ${m}`),
  ...auditFrontendPage(pageSrc).map((m) => `[page] ${m}`),
];

if (failures.length) {
  console.error(`verify-tasks-id-scope-rls-fix FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const total = 1 + ROUTES.length + 6 + 3;

  // 1. Reintroducing the broken pattern anywhere must fail, regardless of surrounding context.
  {
    const mutated = backendSrc + "\n// regression probe: " + BROKEN_PATTERN + "\n";
    if (mutated !== backendSrc && auditBackend(mutated).length > 0) caught++;
  }

  // 2..9. Drop TaskScopeQuerySchema.safeParse from each route one at a time.
  for (const marker of ROUTES) {
    const block = routeBlock(backendSrc, marker, ROUTES.filter((m) => m !== marker));
    if (!block) continue;
    const mutatedBlock = block.replace(
      /const scopeParsed = TaskScopeQuerySchema\.safeParse\(request\.query \?\? \{\}\);\n\s*if \(!scopeParsed\.success\) return reply\.code\(400\)\.send\(\{ error: "validation_error", details: scopeParsed\.error\.flatten\(\) \}\);\n/,
      ""
    );
    if (mutatedBlock === block) continue; // route doesn't validate scope up top this way; skip
    const mutated = backendSrc.replace(block, mutatedBlock);
    if (mutated !== backendSrc && auditBackend(mutated).length > 0) caught++;
  }

  // 10..15. Drop operating_company_id forwarding from each frontend api function.
  const fnNames = ["fetchTaskComments", "createTaskComment", "fetchTaskActivity", "fetchTaskLinks", "createTaskLink", "updateTaskProgress"];
  for (const name of fnNames) {
    const start = apiSrc.indexOf(`export async function ${name}(`);
    const end = apiSrc.indexOf("\n}", start);
    const body = apiSrc.slice(start, end);
    const mutatedBody = body.replace(/operating_company_id/g, "OMITTED");
    const mutated = apiSrc.replace(body, mutatedBody);
    if (mutated !== apiSrc && auditFrontendApi(mutated).length > 0) caught++;
  }

  // 16..18. Drop companyId argument from each TasksChatPage call site.
  const pageCallSites = [
    ["fetchTaskComments(activeTaskId, companyId, signal)", "fetchTaskComments(activeTaskId, signal)"],
    ["fetchTaskActivity(activeTaskId, companyId, signal)", "fetchTaskActivity(activeTaskId, signal)"],
    ["createTaskComment(activeTaskId, companyId, draft.trim(), kept)", "createTaskComment(activeTaskId, draft.trim(), kept)"],
  ];
  for (const [good, bad] of pageCallSites) {
    if (!pageSrc.includes(good)) continue;
    const mutated = pageSrc.replace(good, bad);
    if (mutated !== pageSrc && auditFrontendPage(mutated).length > 0) caught++;
  }

  if (caught < total) {
    throw new Error(`selftest: only ${caught}/${total} mutations were caught`);
  }
  console.log(`verify-tasks-id-scope-rls-fix SELFTEST PASS — ${caught}/${total} mutations detected`);
}

console.log("verify-tasks-id-scope-rls-fix PASS — all seven :id-scoped task routes set RLS scope before querying, frontend forwards operating_company_id");
