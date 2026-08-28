#!/usr/bin/env node
/**
 * verify-dispatch-cancel-reason-catalog.mjs  (0441-mod13 split-brain)
 *
 * Root cause: CancelLoadModal read legacy global catalogs.cancellation_reasons via
 * GET /api/v1/dispatch/cancellation-reasons while Lists → Load Cancellation Reasons
 * edits catalogs.load_cancellation_reasons per entity — dropdown ≠ list page.
 *
 * Locks: cancel read + validate paths use catalogs.load_cancellation_reasons scoped by
 * operating_company_id; CancelLoadModal passes company id into the reasons fetch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-cancel-reason-catalog";

const CANCELLATION_SERVICE = "apps/backend/src/dispatch/cancellation.service.ts";
const CANCELLATION_ROUTES = "apps/backend/src/dispatch/cancellation.routes.ts";
const LOADS_ROUTES = "apps/backend/src/mdata/loads.routes.ts";
const DISPATCH_API = "apps/frontend/src/api/dispatch.ts";
const CANCEL_MODAL = "apps/frontend/src/components/dispatch/CancelLoadModal.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest planted fixtures. */
export function checkCancellationServiceCatalog(src) {
  const failures = [];
  if (/FROM catalogs\.cancellation_reasons/.test(src)) {
    failures.push(`${CANCELLATION_SERVICE}: must not read legacy catalogs.cancellation_reasons`);
  }
  if (!/FROM catalogs\.load_cancellation_reasons/.test(src)) {
    failures.push(`${CANCELLATION_SERVICE}: cancel/list paths must read catalogs.load_cancellation_reasons`);
  }
  if (!/operating_company_id = \$2/.test(src) && !/operating_company_id = \$1/.test(src)) {
    failures.push(`${CANCELLATION_SERVICE}: reason lookups must filter by operating_company_id`);
  }
  if (!/display_name AS reason_label/.test(src)) {
    failures.push(`${CANCELLATION_SERVICE}: listCancellationReasons must expose display_name as reason_label`);
  }
  return failures;
}

export function checkCancellationRoutesCompanyQuery(src) {
  const failures = [];
  if (!/cancellationReasonsQuerySchema/.test(src)) {
    failures.push(`${CANCELLATION_ROUTES}: GET cancellation-reasons must validate operating_company_id query`);
  }
  if (!/listCancellationReasons\(user\.uuid,\s*query\.data\.operating_company_id\)/.test(src)) {
    failures.push(`${CANCELLATION_ROUTES}: GET must pass operating_company_id into listCancellationReasons`);
  }
  return failures;
}

export function checkDispatchApiCompanyParam(src) {
  const failures = [];
  if (!/listDispatchCancellationReasons\(operatingCompanyId:\s*string\)/.test(src)) {
    failures.push(`${DISPATCH_API}: listDispatchCancellationReasons must require operatingCompanyId`);
  }
  if (!/operating_company_id/.test(src)) {
    failures.push(`${DISPATCH_API}: listDispatchCancellationReasons must send operating_company_id query param`);
  }
  return failures;
}

export function checkCancelModalCompanyScopedFetch(src) {
  const failures = [];
  if (!/listDispatchCancellationReasons\(operatingCompanyId\)/.test(src)) {
    failures.push(`${CANCEL_MODAL}: reasons query must call listDispatchCancellationReasons(operatingCompanyId)`);
  }
  if (!/\["dispatch",\s*"cancellation-reasons",\s*operatingCompanyId\]/.test(src)) {
    failures.push(`${CANCEL_MODAL}: queryKey must include operatingCompanyId`);
  }
  if (!/reason\.reason_label\s*\?\?\s*reason\.display_name/.test(src)) {
    failures.push(`${CANCEL_MODAL}: dropdown label must accept catalog display_name`);
  }
  if (!/disabled=\{reasonsQuery\.isLoading \|\| reasonsQuery\.isError\}/.test(src)) {
    failures.push(`${CANCEL_MODAL}: reason picker must be disabled while its canonical catalog is unknown`);
  }
  if (!/reasonsQuery\.isError\s*\?\s*\([\s\S]{0,180}<ListErrorState[\s\S]{0,180}Cancellation reasons unavailable\.[\s\S]{0,180}reasonsQuery\.refetch\(\)/.test(src)) {
    failures.push(`${CANCEL_MODAL}: reason catalog failure must be visible and retryable`);
  }
  return failures;
}

export function checkLoadsStatusPatchUsesEntityCatalog(src) {
  const failures = [];
  if (/FROM catalogs\.cancellation_reasons/.test(src)) {
    failures.push(`${LOADS_ROUTES}: status PATCH must not read legacy catalogs.cancellation_reasons`);
  }
  if (!/FROM catalogs\.load_cancellation_reasons/.test(src)) {
    failures.push(`${LOADS_ROUTES}: status PATCH must validate against catalogs.load_cancellation_reasons`);
  }
  if (!/operating_company_id/.test(src)) {
    failures.push(`${LOADS_ROUTES}: status PATCH reason lookup must scope by operating_company_id`);
  }
  return failures;
}

export function run() {
  const checks = [
    [CANCELLATION_SERVICE, checkCancellationServiceCatalog],
    [CANCELLATION_ROUTES, checkCancellationRoutesCompanyQuery],
    [LOADS_ROUTES, checkLoadsStatusPatchUsesEntityCatalog],
    [DISPATCH_API, checkDispatchApiCompanyParam],
    [CANCEL_MODAL, checkCancelModalCompanyScopedFetch],
  ];
  const failures = [];
  for (const [rel, fn] of checks) {
    const { ok, src, err } = read(rel);
    if (!ok) {
      failures.push(err);
      continue;
    }
    failures.push(...fn(src));
  }
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodService = `
    FROM catalogs.load_cancellation_reasons
    WHERE reason_code = $1 AND operating_company_id = $2
    display_name AS reason_label
    WHERE operating_company_id = $1
  `;
  const badServiceLegacy = `FROM catalogs.cancellation_reasons WHERE reason_code = $1`;
  const goodRoutes = `
    const cancellationReasonsQuerySchema = z.object({ operating_company_id: z.string().uuid() });
    return listCancellationReasons(user.uuid, query.data.operating_company_id);
  `;
  const badRoutes = `return listCancellationReasons(user.uuid);`;
  const goodApi = `
    export function listDispatchCancellationReasons(operatingCompanyId: string) {
      u.set("operating_company_id", operatingCompanyId);
    }
  `;
  const badApi = `export function listDispatchCancellationReasons() { return apiRequest("/api/v1/dispatch/cancellation-reasons"); }`;
  const goodModal = `
    queryKey: ["dispatch", "cancellation-reasons", operatingCompanyId],
    queryFn: () => listDispatchCancellationReasons(operatingCompanyId)
    reason.reason_label ?? reason.display_name
    disabled={reasonsQuery.isLoading || reasonsQuery.isError}
    reasonsQuery.isError ? (<ListErrorState message="Cancellation reasons unavailable." onRetry={() => void reasonsQuery.refetch()} />) : null
  `;
  const badModal = `
    queryKey: ["dispatch", "cancellation-reasons"],
    queryFn: () => listDispatchCancellationReasons()
    label: String(reason.reason_label)
  `;
  const badModalActionable = goodModal.replace(
    "reasonsQuery.isLoading || reasonsQuery.isError",
    "reasonsQuery.isLoading",
  );
  const badModalSilent = goodModal.replace("reasonsQuery.isError ? (", "false ? (");
  const goodLoads = `
    FROM catalogs.load_cancellation_reasons
    WHERE reason_code = $1 AND operating_company_id = $2
  `;
  const badLoads = `FROM catalogs.cancellation_reasons WHERE reason_code = $1`;

  const checks = [
    ["good service passes", checkCancellationServiceCatalog(goodService).length === 0],
    ["legacy service fails", checkCancellationServiceCatalog(badServiceLegacy).length > 0],
    ["good routes pass", checkCancellationRoutesCompanyQuery(goodRoutes).length === 0],
    ["routes without company fail", checkCancellationRoutesCompanyQuery(badRoutes).length > 0],
    ["good api passes", checkDispatchApiCompanyParam(goodApi).length === 0],
    ["api without company fails", checkDispatchApiCompanyParam(badApi).length > 0],
    ["good modal passes", checkCancelModalCompanyScopedFetch(goodModal).length === 0],
    ["modal without company fails", checkCancelModalCompanyScopedFetch(badModal).length > 0],
    ["modal actionable on catalog failure fails", checkCancelModalCompanyScopedFetch(badModalActionable).length > 0],
    ["modal silent on catalog failure fails", checkCancelModalCompanyScopedFetch(badModalSilent).length > 0],
    ["good loads patch passes", checkLoadsStatusPatchUsesEntityCatalog(goodLoads).length === 0],
    ["legacy loads patch fails", checkLoadsStatusPatchUsesEntityCatalog(badLoads).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — cancel paths use per-entity load_cancellation_reasons catalog`);
process.exit(0);
