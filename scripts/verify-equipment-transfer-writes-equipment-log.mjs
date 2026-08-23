#!/usr/bin/env node
/**
 * 0242 / biz-flow-8 — equipment transfer completion must INSERT mdata.equipment_log.
 *
 * Static source guard (Rule 17): asserts the canonical dual-confirm inbound path and the
 * legacy mdata transfer finalize/confirm paths write equipment_log in the same function
 * that UPDATEs mdata.equipment.assigned_driver_id.
 *
 * Schema note: mdata.equipment_log.event_type CHECK allows only
 * Coupled|Uncoupled|Moved|StatusChange|MaintenanceStart|MaintenanceEnd|Note — transfers
 * use 'Moved' (no migration; columns already exist).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function extractFunctionRegion(source, functionName) {
  const startRe = new RegExp(`(?:export\\s+)?async\\s+function\\s+${functionName}\\b`);
  const match = startRe.exec(source);
  if (!match) return "";
  const start = match.index;
  const rest = source.slice(start + match[0].length);
  const nextFn = /(?:export\s+)?async\s+function\s+\w+/.exec(rest);
  const end = nextFn ? start + match[0].length + nextFn.index : source.length;
  return source.slice(start, end);
}

function assertTransferCompletionWritesLog(relativePath, functionName, opts = {}) {
  const source = read(relativePath);
  if (!source) return;
  const body = extractFunctionRegion(source, functionName);
  if (!body) {
    fail(`${relativePath}: could not extract function ${functionName}`);
    return;
  }
  if (!/UPDATE\s+mdata\.equipment[\s\S]*assigned_driver_id/.test(body)) {
    fail(`${relativePath}::${functionName}: missing UPDATE mdata.equipment SET assigned_driver_id`);
  }
  const hasInlineInsert = /INSERT\s+INTO\s+mdata\.equipment_log/.test(body);
  const hasHelperCall = /insertEquipmentTransferLog\s*\(/.test(body);
  if (!hasInlineInsert && !hasHelperCall) {
    fail(
      `${relativePath}::${functionName}: missing INSERT INTO mdata.equipment_log (or insertEquipmentTransferLog call) in same function`
    );
  }
  if (opts.requireMovedLiteral) {
    const search = hasInlineInsert ? body : source;
    if (!/'Moved'/.test(search)) {
      fail(`${relativePath}::${functionName}: equipment_log event_type must be 'Moved' (CHECK-safe)`);
    }
  }
}

assertTransferCompletionWritesLog(
  "apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts",
  "confirmInbound",
  { requireMovedLiteral: true }
);
assertTransferCompletionWritesLog(
  "apps/backend/src/mdata/equipment-transfer.service.ts",
  "confirmTransfer",
  { requireMovedLiteral: true }
);
assertTransferCompletionWritesLog(
  "apps/backend/src/mdata/equipment-transfer.service.ts",
  "finalizeDualAckTransfer",
  { requireMovedLiteral: true }
);

const legacy = read("apps/backend/src/mdata/equipment-transfer.service.ts");
if (legacy) {
  const helper = extractFunctionRegion(legacy, "insertEquipmentTransferLog");
  if (!helper || !/INSERT\s+INTO\s+mdata\.equipment_log/.test(helper)) {
    fail(
      "apps/backend/src/mdata/equipment-transfer.service.ts: insertEquipmentTransferLog must INSERT INTO mdata.equipment_log"
    );
  }
  if (helper && !/'Moved'/.test(helper)) {
    fail(
      "apps/backend/src/mdata/equipment-transfer.service.ts: insertEquipmentTransferLog must use event_type 'Moved'"
    );
  }
}

const dual = read("apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts");
if (dual && /INSERT\s+INTO\s+mdata\.equipment_log/.test(dual) && !/'Moved'/.test(dual)) {
  fail(
    "apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts: equipment_log INSERT must use event_type 'Moved'"
  );
}

const dualTest = read("apps/backend/src/dispatch/equipment-transfer/__tests__/dual-confirm.test.ts");
if (dualTest && !/INSERT INTO mdata\.equipment_log/.test(dualTest)) {
  fail("dual-confirm.test.ts: missing assertion for INSERT INTO mdata.equipment_log");
}

const logRoutes = read("apps/backend/src/mdata/equipment-log.routes.ts");
const transferRoutes = read("apps/backend/src/mdata/equipment-transfer.routes.ts");
function auditListReadScope(source) {
  const start = source.indexOf('app.get("/api/v1/mdata/equipment-log"');
  const end = source.indexOf('app.post("/api/v1/mdata/equipment-log"', start);
  const route = source.slice(start, end);
  const routeFailures = [];
  const schema = source.slice(source.indexOf("const listQuerySchema = z.object({"), source.indexOf("const idParamSchema"));
  if (!/operating_company_id:\s*z\.string\(\)\.uuid\(\),/.test(schema)) {
    routeFailures.push("list GET must require explicit operating_company_id");
  }
  if (!/resolveOperatingCompanyId\(client, authUser\.uuid, operating_company_id\)/.test(route)) {
    routeFailures.push("list GET must resolve the selected company instead of the account default");
  }
  if (!/JOIN mdata\.equipment e ON e\.id = el\.equipment_id AND \(e\.owner_company_id = \$1 OR e\.currently_leased_to_company_id = \$1\)/.test(route)) {
    routeFailures.push("list GET must gate equipment-log rows through selected-company equipment");
  }
  return routeFailures;
}

for (const listFailure of auditListReadScope(logRoutes)) fail(listFailure);

function auditDetailReadScope(source) {
  const detail = source.slice(source.indexOf('app.get("/api/v1/mdata/equipment-log/:id"'));
  const detailFailures = [];
  if (!/const parsedQuery = companyQuerySchema\.safeParse\(req\.query \?\? \{\}\)/.test(detail)) {
    detailFailures.push("detail GET must validate explicit operating_company_id");
  }
  if (!/resolveOperatingCompanyId\([\s\S]{0,160}authUser\.uuid,[\s\S]{0,120}parsedQuery\.data\.operating_company_id/.test(detail)) {
    detailFailures.push("detail GET must resolve the selected company instead of the account default");
  }
  if (!/JOIN mdata\.equipment e ON e\.id = el\.equipment_id[\s\S]{0,180}\(e\.owner_company_id = \$2 OR e\.currently_leased_to_company_id = \$2\)/.test(detail)) {
    detailFailures.push("detail GET must gate the equipment-log row through the selected company's equipment");
  }
  return detailFailures;
}

for (const detailFailure of auditDetailReadScope(logRoutes)) fail(detailFailure);

function auditPendingPwaScope(source) {
  const start = source.indexOf('app.get("/api/v1/driver-pwa/my-pending-transfers"');
  const end = source.indexOf('app.post("/api/v1/driver-pwa/transfers/', start);
  const route = source.slice(start, end);
  const routeFailures = [];
  if (!/const operatingCompanyId = await resolveOperatingCompanyForUser\(user\.uuid\)/.test(route)) {
    routeFailures.push("pending PWA transfer GET must resolve the driver's company");
  }
  if (!/listTransfers\(user\.uuid, \{[\s\S]{0,120}operating_company_id: operatingCompanyId,[\s\S]{0,120}to_driver_id: driverId/.test(route)) {
    routeFailures.push("pending PWA transfer GET must bind company and driver to the list query");
  }
  return routeFailures;
}

for (const routeFailure of auditPendingPwaScope(transferRoutes)) fail(routeFailure);

if (process.argv.includes("--selftest")) {
  if (failures.length > 0) {
    console.error(`verify-equipment-transfer-writes-equipment-log SELFTEST FAIL — real repo state rejected:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["query", /const parsedQuery = companyQuerySchema\.safeParse\(req\.query \?\? \{\}\)/],
    ["selected-company", /parsedQuery\.data\.operating_company_id/],
    ["equipment-gate", /\(e\.owner_company_id = \$2 OR e\.currently_leased_to_company_id = \$2\)/],
  ];
  let caught = 0;
  for (const [name, pattern] of [
    ["list-query-required", /operating_company_id:\s*z\.string\(\)\.uuid\(\),/],
    ["list-selected-company", /resolveOperatingCompanyId\(client, authUser\.uuid, operating_company_id\)/],
    ["list-equipment-gate", /JOIN mdata\.equipment e ON e\.id = el\.equipment_id AND \(e\.owner_company_id = \$1 OR e\.currently_leased_to_company_id = \$1\)/],
  ]) {
    const mutated = logRoutes.replace(pattern, "REMOVED");
    if (mutated === logRoutes || auditListReadScope(mutated).length === 0) {
      console.error(`verify-equipment-transfer-writes-equipment-log SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  for (const [name, pattern] of mutations) {
    const detailStart = logRoutes.indexOf('app.get("/api/v1/mdata/equipment-log/:id"');
    const prefix = logRoutes.slice(0, detailStart);
    const detail = logRoutes.slice(detailStart);
    const mutatedDetail = detail.replace(pattern, "REMOVED");
    if (mutatedDetail === detail) {
      console.error(`verify-equipment-transfer-writes-equipment-log SELFTEST FAIL — ${name} mutation did not match`);
      process.exit(1);
    }
    if (auditDetailReadScope(prefix + mutatedDetail).length === 0) {
      console.error(`verify-equipment-transfer-writes-equipment-log SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  for (const [name, pattern] of [
    ["pending-company-resolver", /const operatingCompanyId = await resolveOperatingCompanyForUser\(user\.uuid\)/],
    ["pending-company-bind", /operating_company_id: operatingCompanyId,/],
  ]) {
    const start = transferRoutes.indexOf('app.get("/api/v1/driver-pwa/my-pending-transfers"');
    const prefix = transferRoutes.slice(0, start);
    const route = transferRoutes.slice(start);
    const mutatedRoute = route.replace(pattern, "REMOVED");
    if (mutatedRoute === route || auditPendingPwaScope(prefix + mutatedRoute).length === 0) {
      console.error(`verify-equipment-transfer-writes-equipment-log SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`verify-equipment-transfer-writes-equipment-log SELFTEST PASS — ${caught}/8 scope mutations detected`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify-equipment-transfer-writes-equipment-log — FAILED");
  for (const entry of failures) {
    console.error(`  x ${entry}`);
  }
  process.exit(1);
}

console.log("verify-equipment-transfer-writes-equipment-log — OK");
