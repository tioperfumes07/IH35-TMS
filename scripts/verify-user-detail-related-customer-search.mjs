#!/usr/bin/env node
/**
 * @matrix-built users,safety,dispatch,customers,drivers
 * @matrix-cols customer,driver,load,connectivity,reverse_link
 * UserDetail dispatcher safety — canonical company-scoped pickers, FK payload, and labelled drill-through.
 * Claim 2158.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-detail-related-customer-search";
const FILE = "apps/frontend/src/pages/UserDetail.tsx";
const API = "apps/frontend/src/api/identity.ts";
const ROUTE = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";
const REVERSE = "apps/frontend/src/components/safety/DispatcherSafetyEventsReverseBlock.tsx";
const LOAD_REVERSE = "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx";
const DRIVER_REVERSE = "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx";
const CUSTOMER = "apps/frontend/src/pages/CustomerDetail.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const api = readRel(root, API);
  const route = readRel(root, ROUTE);
  const reverse = readRel(root, REVERSE);
  const loadReverse = readRel(root, LOAD_REVERSE);
  const driverReverse = readRel(root, DRIVER_REVERSE);
  const customer = readRel(root, CUSTOMER);
  if (!api) problems.push(`missing ${API}`);
  if (!route) problems.push(`missing ${ROUTE}`);
  if (!reverse) problems.push(`missing ${REVERSE}`);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/createKind=["']customer["']/.test(code)) problems.push(`${FILE}: related customer must ReferenceSelect createKind=customer`);
  if (!/customerSearch/.test(code) || !/search:\s*customerSearch/.test(code)) {
    problems.push(`${FILE}: listCustomers must pass search: customerSearch`);
  }
  if (/listDrivers\(/.test(code)) problems.push(`${FILE}: must not silent-fetch listDrivers (use DriverPickerWithCreate)`);
  if (!/DriverPickerWithCreate/.test(code)) problems.push(`${FILE}: related driver must use DriverPickerWithCreate`);
  if (!/<EntityPicker[\s\S]*?kind=["']load["'][\s\S]*?value=\{relatedLoadId\}/.test(code)) {
    problems.push(`${FILE}: related load must use the canonical EntityPicker`);
  }
  if (!/related_load_id:\s*enableRelated\s*\?\s*relatedLoadId\s*\?\?\s*undefined/.test(code)) {
    problems.push(`${FILE}: create payload must forward the selected related_load_id`);
  }
  for (const [kind, id, label] of [
    ["customer", "related_customer_id", "related_customer_name"],
    ["driver", "related_driver_id", "related_driver_name"],
    ["load", "related_load_id", "related_load_number"],
  ]) {
    if (!new RegExp(`<EntityLink\\s+kind=["']${kind}["'][^>]*id=\\{event\\.${id}\\}[^>]*event\\.${label}`).test(code)) {
      problems.push(`${FILE}: ${id} must drill through with its resolved human label`);
    }
  }
  if (api && (!/operating_company_id:\s*operatingCompanyId/.test(api) || !/related_load_number\?:\s*string/.test(api))) {
    problems.push(`${API}: list request/type must carry company scope and resolved linkage labels`);
  }
  if (route) {
    for (const [table, alias, id] of [
      ["loads", "rl", "related_load_id"],
      ["customers", "rc", "related_customer_id"],
    ]) {
      const join = new RegExp(`LEFT JOIN\\s+mdata\\.${table}\\s+${alias}\\s+ON\\s+${alias}\\.id\\s*=\\s*e\\.${id}\\s+AND\\s+${alias}\\.operating_company_id\\s*=\\s*\\$2`);
      if (!join.test(route)) problems.push(`${ROUTE}: ${id} label join must be explicitly company-scoped`);
    }
    // Shared drivers are valid for the selected company when they have an active
    // driver_company_authorizations row. Require that canonical scope predicate on
    // both the user-detail ($2) and reverse-list ($1) reads; direct ownership alone
    // would incorrectly hide authorized shared drivers.
    for (const [label, parameter, authorizationAlias] of [
      ["user detail", "2", "dispatcher_user_dca"],
      ["reverse list", "1", "dispatcher_reverse_dca"],
    ]) {
      const driverJoin = new RegExp(
        `LEFT JOIN\\s+mdata\\.drivers\\s+rd\\s+ON\\s+rd\\.id\\s*=\\s*e\\.related_driver_id\\s+AND\\s+\\(rd\\.operating_company_id\\s*=\\s*\\$${parameter}::uuid\\s+OR\\s+EXISTS\\s*\\([\\s\\S]{0,500}FROM\\s+mdata\\.driver_company_authorizations\\s+${authorizationAlias}[\\s\\S]{0,300}${authorizationAlias}\\.company_id\\s*=\\s*\\$${parameter}::uuid[\\s\\S]{0,200}${authorizationAlias}\\.is_authorized\\s*=\\s*true[\\s\\S]{0,200}${authorizationAlias}\\.deactivated_at\\s+IS\\s+NULL`
      );
      if (!driverJoin.test(route)) problems.push(`${ROUTE}: related_driver_id ${label} label join must be selected-company owned or actively authorized`);
    }
    if (!/app\.get\(["']\/api\/v1\/mdata\/dispatcher-safety-events["']/.test(route)) {
      problems.push(`${ROUTE}: reverse route is not mounted`);
    }
    if (!/exactly one related entity filter is required/.test(route) || !/e\.related_(?:load|customer|driver)_id = \$2 AND r[lc d]/.test(route)) {
      problems.push(`${ROUTE}: reverse route must require and apply one canonical related FK`);
    }
  }
  if (reverse && (!/listDispatcherSafetyEventsByRelatedEntity/.test(reverse) || !/<EntityLink[\s\S]*?kind=["']user["']/.test(reverse))) {
    problems.push(`${REVERSE}: reverse rows must query server-side and drill to the dispatcher profile`);
  }
  if (reverse && (!/formatUsd\(event\.cost_amount\)/.test(reverse) || !/event\.cost_recovery_status/.test(reverse))) {
    problems.push(`${REVERSE}: reverse rows must expose the event's economic impact and recovery state`);
  }
  for (const [file, text, related] of [
    [LOAD_REVERSE, loadReverse, "load"],
    [DRIVER_REVERSE, driverReverse, "driver"],
    [CUSTOMER, customer, "customer"],
  ]) {
    if (!text || !new RegExp(`DispatcherSafetyEventsReverseBlock[\\s\\S]*?related=["']${related}["']`).test(text)) {
      problems.push(`${file}: must mount dispatcher safety reverse rows for ${related}`);
    }
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-user-detail-"));
  try {
    const files = [FILE, API, ROUTE, REVERSE, LOAD_REVERSE, DRIVER_REVERSE, CUSTOMER];
    for (const file of files) {
      const target = path.join(stubRoot, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), target);
    }
    const mutations = [
      [FILE, "related_load_id: enableRelated ? relatedLoadId ?? undefined : undefined", "related_load_id: undefined"],
      [ROUTE, "rl.operating_company_id = $2", "TRUE"],
      [ROUTE, "dispatcher_user_dca.company_id = $2::uuid", "dispatcher_user_dca.company_id IS NOT NULL"],
      [ROUTE, "dispatcher_reverse_dca.company_id = $1::uuid", "dispatcher_reverse_dca.company_id IS NOT NULL"],
      [ROUTE, 'app.get("/api/v1/mdata/dispatcher-safety-events"', 'app.get("/api/v1/mdata/disabled-dispatcher-events"'],
      [REVERSE, 'kind="user"', 'kind="load"'],
      [REVERSE, "formatUsd(event.cost_amount)", '"hidden"'],
      [CUSTOMER, 'related="customer"', 'related="load"'],
    ];
    for (const [file, before, after] of mutations) {
      const target = path.join(stubRoot, file);
      const original = fs.readFileSync(target, "utf8");
      if (!original.includes(before)) {
        console.error(`${LABEL} selftest fixture drift: ${file} missing ${before}`);
        process.exit(1);
      }
      fs.writeFileSync(target, original.replace(before, after));
      if (!collectProblems(stubRoot).length) {
        console.error(`${LABEL} mutation survived: ${file} ${before}`);
        process.exit(1);
      }
      fs.writeFileSync(target, original);
    }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK (8/8 mutations killed)");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, problems); process.exit(1); }
  console.log(LABEL, "OK");
}
