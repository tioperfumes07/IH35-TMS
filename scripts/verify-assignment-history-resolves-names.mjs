#!/usr/bin/env node
/**
 * The load assignment-history trail must show WHO, and must be entity-gated.
 *
 * Two defects lived in one function (dispatch/quick-assign.service.ts getAssignmentHistory):
 *
 *  1. CLS-UUID-LABEL — it was `SELECT *` from dispatch.load_assignment_history, so previous_driver_id
 *     and new_driver_id reached the client as bare uuids and LoadDetailDrawer rendered
 *     String(id).slice(0, 8). An 8-character uuid prefix is not an identification of a human being,
 *     and this tab is the audit trail of who a load was taken away from and given to.
 *
 *  2. MDATA-F09 class — operatingCompanyId arrives straight from the caller's query string
 *     (quicksave.routes.ts passes query.data.operating_company_id) and is used both to SET
 *     app.operating_company_id and as the WHERE predicate, with no membership assertion. The caller
 *     picked the scope RLS would enforce.
 *
 * Defect 2 matters beyond this function: verify-caller-scoped-guc-membership.mjs only walks
 * `*.routes.ts`, and this GUC set lives in a `.service.ts`. Measured across apps/backend/src there are
 * 454 set_config('app.operating_company_id') calls in *.routes.ts and 568 in non-route files, so that
 * ratchet sees under half the surface. This guard does not fix the general gap — it pins the one
 * function that was actually found broken, and the general gap is filed as an OPEN class on the board.
 *
 * CHECKED in getAssignmentHistory:
 *   a. calls assertCompanyMembership before set_config of app.operating_company_id
 *   b. no bare `SELECT *` — it must project resolved display names
 *   c. resolves previous_driver_name and new_driver_name
 *   d. the driver joins are entity-scoped (operating_company_id on the join)
 * and in LoadDetailDrawer: no .slice( on a *_driver_id.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SERVICE = "apps/backend/src/dispatch/quick-assign.service.ts";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const PAGE = "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx";
const LABEL = "verify-assignment-history-resolves-names";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Body of getAssignmentHistory, from its declaration to the next top-level export. */
function fnBody(src) {
  const start = src.search(/export\s+async\s+function\s+getAssignmentHistory\b/);
  if (start === -1) return null;
  const rest = src.slice(start + 10);
  const nextExport = rest.search(/\nexport\s/);
  return nextExport === -1 ? src.slice(start) : src.slice(start, start + 10 + nextExport);
}

export function auditService(raw) {
  const problems = [];
  const src = stripComments(raw);
  const body = fnBody(src);
  if (body === null) {
    problems.push(`${SERVICE}: getAssignmentHistory not found — the assignment-history endpoint lost its resolver.`);
    return problems;
  }
  const assertAt = body.search(/\bassertCompanyMembership\s*\(/);
  const gucAt = body.search(/set_config\(\s*['"`]app\.operating_company_id['"`]/);
  if (gucAt !== -1 && assertAt === -1) {
    problems.push(`${SERVICE}: getAssignmentHistory sets app.operating_company_id from a caller-supplied company with no assertCompanyMembership — the caller picks the scope RLS enforces (MDATA-F09 class).`);
  } else if (gucAt !== -1 && assertAt > gucAt) {
    problems.push(`${SERVICE}: getAssignmentHistory asserts membership AFTER setting app.operating_company_id — the scope must be proven before it is applied.`);
  }
  if (/SELECT\s+\*\s+FROM\s+dispatch\.load_assignment_history/i.test(body)) {
    problems.push(`${SERVICE}: getAssignmentHistory uses SELECT * — it must project resolved display names, or the drawer falls back to rendering raw uuids (CLS-UUID-LABEL).`);
  }
  for (const col of ["previous_driver_name", "new_driver_name"]) {
    if (!body.includes(col)) {
      problems.push(`${SERVICE}: getAssignmentHistory does not resolve ${col} — the history tab must name the driver, not show a uuid prefix.`);
    }
  }
  if (/LEFT\s+JOIN\s+mdata\.drivers/i.test(body) && !/mdata\.drivers[\s\S]{0,200}?operating_company_id/i.test(body)) {
    problems.push(`${SERVICE}: the mdata.drivers join in getAssignmentHistory is not entity-scoped — add AND <alias>.operating_company_id = h.operating_company_id.`);
  }
  for (const [role, driverAlias, authAlias] of [
    ["previous", "pd", "assignment_previous_driver_dca"],
    ["new", "nd", "assignment_new_driver_dca"],
  ]) {
    const authorization = new RegExp(`FROM mdata\\.driver_company_authorizations ${authAlias}[\\s\\S]{0,180}${authAlias}\\.driver_id = ${driverAlias}\\.id[\\s\\S]{0,140}${authAlias}\\.company_id = h\\.operating_company_id[\\s\\S]{0,140}${authAlias}\\.is_authorized = true[\\s\\S]{0,140}${authAlias}\\.deactivated_at IS NULL`);
    if (!authorization.test(body)) {
      problems.push(`${SERVICE}: ${role} driver label excludes active canonical shared-driver authorizations.`);
    }
  }
  return problems;
}

export function auditDrawer(raw) {
  const src = stripComments(raw);
  const problems = [];
  if (/\b(?:previous|new)_driver_id\s*\)?\s*\.slice\s*\(/.test(src) || /String\(\s*r\.(?:previous|new)_driver_id\s*\)\s*\.slice\s*\(/.test(src)) {
    problems.push(`${DRAWER}: slices a *_driver_id for display — render the resolved name (CLS-UUID-LABEL).`);
  }
  if (!raw.includes('title="Couldn\'t load assignment history"')) problems.push(`${DRAWER}: failed history read is not visible.`);
  if (!raw.includes("onRetry={() => void assignmentHistoryQuery.refetch()}")) problems.push(`${DRAWER}: failed history read is not retryable.`);
  if (!raw.includes("assignmentHistoryQuery.isError ? [] : assignmentHistoryQuery.data?.rows ?? []")) problems.push(`${DRAWER}: cached history rows remain visible after a failed refetch.`);
  if (!raw.includes("!assignmentHistoryQuery.isError && (assignmentHistoryQuery.data?.rows ?? []).length === 0")) problems.push(`${DRAWER}: failed history read can still render the honest-empty message.`);
  return problems;
}

export function auditPage(raw) {
  const problems = [];
  if (!raw.includes("{...formatQueryErrorDetail(historyQ.error)}")) {
    problems.push(`${PAGE}: query failure must use operator-safe error detail formatting.`);
  }
  if (/message=\{\(historyQ\.error\s+as\s+Error\)\?\.message\}/.test(raw)) {
    problems.push(`${PAGE}: query failure must not display raw error.message.`);
  }
  if (!raw.includes("onRetry={() => void historyQ.refetch()}")) {
    problems.push(`${PAGE}: query failure must remain retryable.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodSvc = `export async function getAssignmentHistory(u, c, l) {
  await assertCompanyMembership(client, u, c);
  await client.query("SELECT set_config('app.operating_company_id', $1, true)", [c]);
  const rows = await client.query(\`SELECT h.*, x AS previous_driver_name, y AS new_driver_name
    FROM dispatch.load_assignment_history h
    LEFT JOIN mdata.drivers pd ON pd.id = h.previous_driver_id AND (pd.operating_company_id = h.operating_company_id OR EXISTS (SELECT 1 FROM mdata.driver_company_authorizations assignment_previous_driver_dca WHERE assignment_previous_driver_dca.driver_id = pd.id AND assignment_previous_driver_dca.company_id = h.operating_company_id AND assignment_previous_driver_dca.is_authorized = true AND assignment_previous_driver_dca.deactivated_at IS NULL))
    LEFT JOIN mdata.drivers nd ON nd.id = h.new_driver_id AND (nd.operating_company_id = h.operating_company_id OR EXISTS (SELECT 1 FROM mdata.driver_company_authorizations assignment_new_driver_dca WHERE assignment_new_driver_dca.driver_id = nd.id AND assignment_new_driver_dca.company_id = h.operating_company_id AND assignment_new_driver_dca.is_authorized = true AND assignment_new_driver_dca.deactivated_at IS NULL))\`);
}
export async function other() {}`;
  const cases = [
    ["correct service", auditService, goodSvc, 0],
    ["no membership assert", auditService, goodSvc.replace(/\s*await assertCompanyMembership[^;]*;/, ""), 1],
    ["assert after GUC", auditService, `export async function getAssignmentHistory(u,c,l){
  await client.query("SELECT set_config('app.operating_company_id', $1, true)", [c]);
  await assertCompanyMembership(client,u,c);
  const q = \`SELECT h.*, a AS previous_driver_name, b AS new_driver_name FROM dispatch.load_assignment_history h LEFT JOIN mdata.drivers pd ON pd.operating_company_id = h.operating_company_id\`;
}
export async function other(){}`, 1],
    ["SELECT * regression", auditService, goodSvc.replace(/SELECT h\.\*[\s\S]*?LEFT JOIN mdata\.drivers[^`]*/, "SELECT * FROM dispatch.load_assignment_history "), 1],
    ["function deleted", auditService, `export async function somethingElse() {}`, 1],
    ["unscoped drivers join", auditService, `export async function getAssignmentHistory(u,c,l){
  await assertCompanyMembership(client,u,c);
  await client.query("SELECT set_config('app.operating_company_id', $1, true)", [c]);
  const q = \`SELECT h.*, a AS previous_driver_name, b AS new_driver_name FROM dispatch.load_assignment_history h LEFT JOIN mdata.drivers pd ON pd.id = h.previous_driver_id\`;
}
export async function other(){}`, 1],
    ["previous shared authorization removed", auditService, goodSvc.replace("FROM mdata.driver_company_authorizations assignment_previous_driver_dca", "FROM removed assignment_previous_driver_dca"), 1],
    ["new shared authorization removed", auditService, goodSvc.replace("FROM mdata.driver_company_authorizations assignment_new_driver_dca", "FROM removed assignment_new_driver_dca"), 1],
    ["clean drawer", auditDrawer, `const prev = driverLabel(r.previous_driver_id, r.previous_driver_name); title="Couldn't load assignment history" onRetry={() => void assignmentHistoryQuery.refetch()} {(assignmentHistoryQuery.isError ? [] : assignmentHistoryQuery.data?.rows ?? []).map(render)} {!assignmentHistoryQuery.isError && (assignmentHistoryQuery.data?.rows ?? []).length === 0}`, 0],
    ["drawer slices the uuid", auditDrawer, `const prev = String(r.previous_driver_id).slice(0, 8);`, 1],
    ["safe retryable page error", auditPage, `{...formatQueryErrorDetail(historyQ.error)} onRetry={() => void historyQ.refetch()}`, 0],
    ["raw page error", auditPage, `message={(historyQ.error as Error)?.message} onRetry={() => void historyQ.refetch()}`, 1],
    ["page retry removed", auditPage, `{...formatQueryErrorDetail(historyQ.error)}`, 1],
  ];
  let bad = 0;
  for (const [name, fn, src, expect] of cases) {
    const got = fn(src).length;
    const ok = expect === 0 ? got === 0 : got >= 1;
    if (!ok) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect ? ">=1" : "0"}, got ${got}`); }
  }
  if (bad) { console.error(`${LABEL} --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const problems = [
  ...auditService(readFileSync(join(ROOT, SERVICE), "utf8")),
  ...auditDrawer(readFileSync(join(ROOT, DRAWER), "utf8")),
  ...auditPage(readFileSync(join(ROOT, PAGE), "utf8")),
];
if (problems.length) {
  console.error(`FAIL ${LABEL}:`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — assignment history is membership-asserted and resolves entity-scoped driver names`);
