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
  communicationsBackend: "apps/backend/src/drivers/communications.routes.ts",
  hosBackend: "apps/backend/src/telematics/hos.routes.ts",
  dispatchBackend: "apps/backend/src/dispatch/loads.routes.ts",
  medicalBackend: "apps/backend/src/safety/medical-cards.routes.ts",
  dqfBackend: "apps/backend/src/safety/driver-qualification.routes.ts",
  rtdBackend: "apps/backend/src/safety/rtd.routes.ts",
  drugProgramBackend: "apps/backend/src/safety/drug-program.routes.ts",
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
  need(/FROM mdata\.drivers d[\s\S]{0,600}selected_dca\.company_id = \$2::uuid[\s\S]{0,160}selected_dca\.is_authorized = true[\s\S]{0,160}selected_dca\.deactivated_at IS NULL/.test(authHandler), "company-authorization backend must validate owner or canonical active authorization for the selected company");
  need(/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(authHandler), "company-authorization backend must distinguish a missing/unauthorized driver from a true empty relationship list");
  const qualificationsStart = source.profileBackend.indexOf('app.get<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/qualifications"');
  const qualificationsEnd = source.profileBackend.indexOf('app.post<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/qualifications"', qualificationsStart);
  const qualificationsHandler = qualificationsStart >= 0 && qualificationsEnd > qualificationsStart ? source.profileBackend.slice(qualificationsStart, qualificationsEnd) : "";
  need(/FROM mdata\.drivers d[\s\S]{0,500}driver_company_authorizations[\s\S]{0,300}dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(qualificationsHandler), "qualifications GET must validate canonical active driver authorization before reading children");
  need(/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(qualificationsHandler), "qualifications GET must distinguish a missing/unauthorized parent from a true empty qualifications list");
  need(/listSafetyEvents\(id, companyId, showVoidedSafetyEvents\)/.test(source.detail), "DriverDetail safety-event reverse GET must send selected companyId");
  need(/queryKey: \["driver-safety-events", id, companyId, showVoidedSafetyEvents\]/.test(source.detail), "safety-event query key must include selected companyId");
  need(/export function listSafetyEvents\(driverId: string, operatingCompanyId: string, includeVoided = false\)/.test(source.api), "safety-event API must require operatingCompanyId");
  const safetyRouteStart = source.safetyBackend.indexOf('app.get("/api/v1/mdata/drivers/:driver_id/safety-events"');
  const safetyRouteEnd = source.safetyBackend.indexOf('app.post("/api/v1/mdata/drivers/:driver_id/safety-events"', safetyRouteStart);
  const safetyHandler = safetyRouteStart >= 0 && safetyRouteEnd > safetyRouteStart ? source.safetyBackend.slice(safetyRouteStart, safetyRouteEnd) : "";
  need(/parsedQuery\.data\.operating_company_id/.test(safetyHandler), "safety-event backend must resolve the selected company");
  need(/SELECT 1[\s\S]{0,180}FROM mdata\.drivers d[\s\S]{0,500}driver_company_authorizations[\s\S]{0,300}dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(safetyHandler), "safety-event backend must prove canonical active driver authorization before listing children");
  need(/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(safetyHandler), "safety-event backend must distinguish an unauthorized/missing parent from a legitimate empty event list");
  need(/FROM mdata\.drivers d[\s\S]{0,600}dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(source.communicationsBackend), "communications GET must validate canonical driver ownership or authorization before listing messages");
  need(/if \(!result\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(source.communicationsBackend), "communications GET must distinguish a missing/unauthorized parent from a true empty log");
  need(/FROM mdata\.drivers d[\s\S]{0,600}dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(source.hosBackend), "driver HOS timeline must preserve active selected-company authorization visibility");
  const dispatchHosStart = source.dispatchBackend.indexOf('app.get("/api/v1/dispatch/drivers/:driver_id/hos-status"');
  const dispatchDrugStart = source.dispatchBackend.indexOf('app.get("/api/v1/dispatch/drivers/:driver_id/drug-status"');
  const dispatchHosHandler = source.dispatchBackend.slice(dispatchHosStart, dispatchDrugStart);
  const dispatchDrugHandler = source.dispatchBackend.slice(dispatchDrugStart, source.dispatchBackend.indexOf('app.', dispatchDrugStart + 20));
  const canonicalDriverAuthorization = /FROM mdata\.drivers d[\s\S]{0,600}dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/;
  need(canonicalDriverAuthorization.test(dispatchHosHandler), "dispatch HOS status must preserve active selected-company authorization visibility");
  need(canonicalDriverAuthorization.test(dispatchDrugHandler), "dispatch drug status must preserve active selected-company authorization visibility");
  need(canonicalDriverAuthorization.test(source.medicalBackend) &&
    (source.medicalBackend.match(/(?<!_)dca\.is_authorized = true/g) ?? []).length === 2,
    "both medical-card reverse GET shapes must validate driver ownership or active authorization");
  need(/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(source.medicalBackend), "medical-card optional exact filter must distinguish invalid parent from true empty cards");
  need(/if \(!cards\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(source.medicalBackend), "medical-card reverse GET must distinguish invalid parent from true empty cards");
  need(canonicalDriverAuthorization.test(source.dqfBackend), "DQF reverse GET must validate driver ownership or active authorization");
  need(/if \(!items\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(source.dqfBackend), "DQF reverse GET must distinguish invalid parent from true empty items");
  need(canonicalDriverAuthorization.test(source.rtdBackend), "RTD reverse GET must validate driver ownership or active authorization");
  need(/if \(!payload\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(source.rtdBackend), "RTD reverse GET must distinguish invalid parent from valid driver without a case");
  need(canonicalDriverAuthorization.test(source.drugProgramBackend), "drug-program status GET must validate driver ownership or active authorization");
  need(/if \(!status\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(source.drugProgramBackend), "drug-program status GET must reject invalid parent instead of fabricating unblocked status");

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
    { key: "safetyBackend", text: replaceOrFail(source.safetyBackend, /dca\.is_authorized = true/, "TRUE", "safety-event active company authorization") },
    { key: "safetyBackend", text: replaceOrFail(source.safetyBackend, /dca\.deactivated_at IS NULL/, "TRUE", "safety-event non-deactivated authorization") },
    { key: "safetyBackend", text: replaceOrFail(source.safetyBackend, /if \(!result\.found\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "safety-event missing parent response") },
    { key: "communicationsBackend", text: replaceOrFail(source.communicationsBackend, /dca\.is_authorized = true/, "TRUE", "communications active company authorization") },
    { key: "communicationsBackend", text: replaceOrFail(source.communicationsBackend, /if \(!result\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "communications missing parent response") },
    { key: "hosBackend", text: replaceOrFail(source.hosBackend, /dca\.is_authorized = true/, "TRUE", "HOS active company authorization") },
    { key: "dispatchBackend", text: replaceOrFail(source.dispatchBackend, /(\/api\/v1\/dispatch\/drivers\/:driver_id\/hos-status[\s\S]{0,1800})dca\.is_authorized = true/, "$1TRUE", "dispatch HOS active company authorization") },
    { key: "dispatchBackend", text: replaceOrFail(source.dispatchBackend, /(\/api\/v1\/dispatch\/drivers\/:driver_id\/drug-status[\s\S]{0,1800})dca\.is_authorized = true/, "$1TRUE", "dispatch drug active company authorization") },
    { key: "medicalBackend", text: replaceOrFail(source.medicalBackend, /dca\.is_authorized = true/, "TRUE", "medical-card active company authorization") },
    { key: "medicalBackend", text: replaceOrFail(source.medicalBackend, /if \(!cards\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "medical-card missing parent response") },
    { key: "dqfBackend", text: replaceOrFail(source.dqfBackend, /dca\.is_authorized = true/, "TRUE", "DQF active company authorization") },
    { key: "dqfBackend", text: replaceOrFail(source.dqfBackend, /if \(!items\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "DQF missing parent response") },
    { key: "rtdBackend", text: replaceOrFail(source.rtdBackend, /dca\.is_authorized = true/, "TRUE", "RTD active company authorization") },
    { key: "rtdBackend", text: replaceOrFail(source.rtdBackend, /if \(!payload\.found\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "RTD missing parent response") },
    { key: "drugProgramBackend", text: replaceOrFail(source.drugProgramBackend, /dca\.is_authorized = true/, "TRUE", "drug-program active company authorization") },
    { key: "drugProgramBackend", text: replaceOrFail(source.drugProgramBackend, /if \(!status\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "drug-program missing parent response") },
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
        /selected_dca\.company_id = \$2::uuid/,
        "TRUE",
        "company authorization selected-company scope"
      ),
    },
    { key: "profileBackend", text: replaceOrFail(source.profileBackend, /selected_dca\.is_authorized = true/, "TRUE", "company authorization active flag") },
    { key: "profileBackend", text: replaceOrFail(source.profileBackend, /selected_dca\.deactivated_at IS NULL/, "TRUE", "company authorization non-deactivated relationship") },
    { key: "profileBackend", text: replaceOrFail(source.profileBackend, /dca\.is_authorized = true/, "TRUE", "qualification active company authorization") },
    { key: "profileBackend", text: replaceOrFail(source.profileBackend, /dca\.deactivated_at IS NULL/, "TRUE", "qualification non-deactivated authorization") },
    { key: "profileBackend", text: replaceOrFail(source.profileBackend, /if \(!result\.found\) return reply\.code\(404\)/, "if (false) return reply.code(404)", "qualification missing parent response") },
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
