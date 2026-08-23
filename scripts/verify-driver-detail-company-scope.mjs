#!/usr/bin/env node
// @matrix-built drivers:profile:{driver,connectivity,reverse_link}; safety:driver.safety.profile:{driver,connectivity}; maintenance:wo.create:{driver,connectivity}; tasks:tasks.drawer.task:{driver,reverse_link}
// Canonical driver by-id contract: lightweight scoped reads stay separate from explicit aggregates.
import fs from "node:fs";

const LABEL = "verify-driver-detail-company-scope";
const FILES = {
  detail: "apps/frontend/src/pages/DriverDetail.tsx",
  api: "apps/frontend/src/api/mdata.ts",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  backend: "apps/backend/src/mdata/drivers.routes.ts",
  profileBackend: "apps/backend/src/mdata/driver-profile.routes.ts",
  safetyBackend: "apps/backend/src/mdata/driver-safety-events.routes.ts",
};
const read = (file) => fs.readFileSync(file, "utf8");

function verify(source) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/useCompanyContext\s*\(/.test(source.detail), "DriverDetail must read selected company context");
  need(/getDriver\(\s*id\s*,\s*[A-Za-z0-9_]+/.test(source.detail), "DriverDetail must call getDriver(id, companyId)");
  need(!/getDriver\(\s*id\s*\)/.test(source.detail), "DriverDetail must not perform a bare unscoped getDriver(id) read");
  need(/companyAuthQuery\.isError[\s\S]{0,500}title="Couldn't load driver company authorizations"[\s\S]{0,500}companyAuthQuery\.refetch\(\)/.test(source.detail), "DriverDetail must fail closed and offer exact retry when company authorization reverse GET fails");
  need(/companiesQuery\.isError[\s\S]{0,500}title="Couldn't load accessible operating companies"[\s\S]{0,500}companiesQuery\.refetch\(\)/.test(source.detail), "DriverDetail must disclose and offer exact retry when accessible-company GET fails");
  need(/!companiesQuery\.isError\s*&&\s*!companyAuthQuery\.isError\s*&&\s*companiesListState\.isEmpty/.test(source.detail), "DriverDetail must not portray either failed company relationship GET as an empty set");
  need(/listDriverCompanyAuthorizations\(id, companyId\)/.test(source.detail), "DriverDetail company-authorizations GET must send selected companyId");
  need(/queryKey: \["driver-company-authorizations", id, companyId\]/.test(source.detail), "company-authorization query key must include selected companyId");
  need(/export function listDriverCompanyAuthorizations\(driverId: string, operatingCompanyId: string\)/.test(source.api), "company-authorization API must require operatingCompanyId");

  const authRouteStart = source.profileBackend.indexOf('app.get<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/company-authorizations"');
  const authRouteEnd = source.profileBackend.indexOf('app.post<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/company-authorizations"', authRouteStart);
  const authHandler = authRouteStart >= 0 && authRouteEnd > authRouteStart ? source.profileBackend.slice(authRouteStart, authRouteEnd) : "";
  need(/parsedQuery\.data\.operating_company_id/.test(authHandler), "company-authorization backend must resolve the selected company");
  need(/JOIN mdata\.drivers d[\s\S]{0,120}d\.operating_company_id = \$2::uuid/.test(authHandler), "company-authorization backend must gate the parent driver to selected company");
  need(/listSafetyEvents\(id, companyId, showVoidedSafetyEvents\)/.test(source.detail), "DriverDetail safety-event reverse GET must send selected companyId");
  need(/queryKey: \["driver-safety-events", id, companyId, showVoidedSafetyEvents\]/.test(source.detail), "safety-event query key must include selected companyId");
  need(/export function listSafetyEvents\(driverId: string, operatingCompanyId: string, includeVoided = false\)/.test(source.api), "safety-event API must require operatingCompanyId");
  const safetyRouteStart = source.safetyBackend.indexOf('app.get("/api/v1/mdata/drivers/:driver_id/safety-events"');
  const safetyRouteEnd = source.safetyBackend.indexOf('app.post("/api/v1/mdata/drivers/:driver_id/safety-events"', safetyRouteStart);
  const safetyHandler = safetyRouteStart >= 0 && safetyRouteEnd > safetyRouteStart ? source.safetyBackend.slice(safetyRouteStart, safetyRouteEnd) : "";
  need(/parsedQuery\.data\.operating_company_id/.test(safetyHandler), "safety-event backend must resolve the selected company");
  need(/SELECT 1[\s\S]{0,180}FROM mdata\.drivers d[\s\S]{0,500}driver_company_authorizations[\s\S]{0,300}dca\.is_active = true/.test(safetyHandler), "safety-event backend must prove the requested parent driver is active in the selected company before listing children");
  need(/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(safetyHandler), "safety-event backend must distinguish an unauthorized/missing parent from a legitimate empty event list");

  const getDriverBlock = source.api.slice(source.api.indexOf("export async function getDriver"), source.api.indexOf("export type DriverSafetyAggregate"));
  need(/const qs = `\?operating_company_id=\$\{encodeURIComponent\(operatingCompanyId\)\}`;/.test(getDriverBlock), "lightweight getDriver must send only operating_company_id, without aggregate opt-in");

  const safetyStart = source.api.indexOf("export function getDriverSafetyAggregate");
  const safetyAggregateBlock = source.api.slice(safetyStart, source.api.indexOf("export function createDriver(", safetyStart));
  need(/aggregate:\s*"true"/.test(safetyAggregateBlock), "DriverSafety aggregate consumer must request aggregate=true");
  need(/aggregate:\s*"true"/.test(source.profile), "DriverProfile aggregate consumer must request aggregate=true");
  need(/const driverAggregateQuerySchema = z\.object\(\{[\s\S]*aggregate:\s*z\.literal\("true"\)/.test(source.backend), "backend aggregate schema must require aggregate=true");

  const routeStart = source.backend.indexOf('app.get("/api/v1/mdata/drivers/:id"');
  const routeEnd = source.backend.indexOf('"/api/v1/mdata/drivers/:id/ap-vendor"', routeStart);
  const handler = routeStart >= 0 && routeEnd > routeStart ? source.backend.slice(routeStart, routeEnd) : "";
  need(Boolean(handler), "GET /api/v1/mdata/drivers/:id handler missing");
  need(/driverAggregateQuerySchema\.safeParse/.test(handler), "by-id route must retain explicit aggregate parsing");
  need(/driverByIdQuerySchema\.safeParse/.test(handler), "by-id route must retain lightweight scoped parsing");
  need(/driver_company_authorizations/.test(handler), "lightweight by-id scope must retain driver authorization fallback");
  return failures;
}

const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
const failures = verify(source);
if (failures.length) {
  console.error(`[${LABEL}] FAILED\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const replaceOrFail = (text, pattern, replacement, label) => {
    const mutated = text.replace(pattern, replacement);
    if (mutated === text) throw new Error(`[${LABEL}] SELFTEST FIXTURE DRIFT — ${label}`);
    return mutated;
  };
  const mutations = [
    {
      key: "detail",
      text: replaceOrFail(
        source.detail,
        /getDriver\(id, companyId(?:, signal)?\)/,
        "getDriver(id)",
        "scoped DriverDetail read",
      ),
    },
    { key: "detail", text: replaceOrFail(source.detail, /listSafetyEvents\(id, companyId, showVoidedSafetyEvents\)/, "listSafetyEvents(id, showVoidedSafetyEvents)", "safety event selected-company call") },
    { key: "api", text: replaceOrFail(source.api, /listSafetyEvents\(driverId: string, operatingCompanyId: string, includeVoided = false\)/, "listSafetyEvents(driverId: string, includeVoided = false)", "safety event required company API") },
    { key: "safetyBackend", text: replaceOrFail(source.safetyBackend, /dca\.is_active = true/, "TRUE", "safety-event active company authorization") },
    { key: "safetyBackend", text: replaceOrFail(source.safetyBackend, /if \(!result\.found\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "safety-event missing parent response") },
    { key: "detail", text: replaceOrFail(source.detail, /companyAuthQuery\.isError/, "false", "company authorization error disclosure") },
    { key: "detail", text: replaceOrFail(source.detail, /companyAuthQuery\.refetch\(\)/, "Promise.resolve()", "company authorization retry") },
    { key: "detail", text: replaceOrFail(source.detail, /companiesQuery\.isError/, "false", "accessible company error disclosure") },
    { key: "detail", text: replaceOrFail(source.detail, /companiesQuery\.refetch\(\)/, "Promise.resolve()", "accessible company retry") },
    { key: "detail", text: replaceOrFail(source.detail, /!companiesQuery\.isError\s*&&\s*!companyAuthQuery\.isError\s*&&\s*companiesListState\.isEmpty/, "companiesListState.isEmpty", "company relationship empty gate") },
    { key: "detail", text: replaceOrFail(source.detail, /listDriverCompanyAuthorizations\(id, companyId\)/, "listDriverCompanyAuthorizations(id)", "company authorization selected-company call") },
    { key: "api", text: replaceOrFail(source.api, /listDriverCompanyAuthorizations\(driverId: string, operatingCompanyId: string\)/, "listDriverCompanyAuthorizations(driverId: string)", "company authorization required company API") },
    {
      key: "profileBackend",
      text: replaceOrFail(
        source.profileBackend,
        /(\/api\/v1\/mdata\/drivers\/:id\/company-authorizations[\s\S]{0,2200})d\.operating_company_id = \$2::uuid/,
        "$1TRUE",
        "company authorization parent driver scope"
      ),
    },
    { key: "api", text: source.api.replace("const qs = `?operating_company_id=${encodeURIComponent(operatingCompanyId)}`;", "const qs = `?operating_company_id=${encodeURIComponent(operatingCompanyId)}&aggregate=true`;") },
    { key: "api", text: source.api.replace('operating_company_id: operatingCompanyId, aggregate: "true"', "operating_company_id: operatingCompanyId") },
    { key: "profile", text: source.profile.replace(', aggregate: "true"', "") },
    { key: "backend", text: source.backend.replace('aggregate: z.literal("true"),', "") },
    { key: "backend", text: source.backend.replaceAll("driver_company_authorizations", "driver_authorizations_broken") },
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (verify({ ...source, [mutation.key]: mutation.text }).length === 0) {
      console.error(`[${LABEL}] SELFTEST FAILED — mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }
  console.log(`[${LABEL}] SELFTEST PASS — ${mutations.length}/${mutations.length} scope/shape/stall regressions rejected`);
}
console.log(`[${LABEL}] PASS — scoped driver reads are lightweight; aggregate consumers opt in explicitly`);
