#!/usr/bin/env node
/**
 * verify-safety-incident-list-filters.mjs — S-08 CI guard (step 990)
 *
 * Locks: SafetyIncidentsClusterSurface exposes driver/unit/date_from/date_to filters,
 * wires them into listSafetyIncidents query params, and the backend GET list route
 * accepts the same filter keys (no silent client-only filter that the API ignores).
 *
 * Usage:
 *   node scripts/verify-safety-incident-list-filters.mjs
 *   node scripts/verify-safety-incident-list-filters.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-incident-list-filters";
const SURFACE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const API = "apps/frontend/src/api/safety.ts";
const ROUTES = "apps/backend/src/safety/incidents.routes.ts";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ surface, api, routes }) {
  const f = [];

  if (!surface) {
    f.push(`${SURFACE}: missing`);
  } else {
    for (const marker of [
      "filter-driver",
      "filter-unit",
      "listFilters",
      "listSafetyIncidents(operatingCompanyId, config.incidentType, listFilters)",
    ]) {
      if (!surface.includes(marker)) {
        f.push(`${SURFACE}: must include ${marker}`);
      }
    }
    // s-04 AccidentsPage-parity testids (preferred) OR legacy pageTestId-prefixed markers from S-08.
    const hasFrom =
      surface.includes("safety-incidents-from-date") || surface.includes("filter-date-from");
    const hasTo =
      surface.includes("safety-incidents-to-date") || surface.includes("filter-date-to");
    if (!hasFrom) f.push(`${SURFACE}: must include safety-incidents-from-date (or filter-date-from)`);
    if (!hasTo) f.push(`${SURFACE}: must include safety-incidents-to-date (or filter-date-to)`);
    if (!/useListState\s*\(\s*listQuery/.test(surface)) {
      f.push(`${SURFACE}: must keep useListState(listQuery, …) for empty/loading`);
    }
  }

  if (!api) {
    f.push(`${API}: missing`);
  } else {
    if (!/export type SafetyIncidentListFilters/.test(api) && !/SafetyIncidentListFilters/.test(api)) {
      f.push(`${API}: must export SafetyIncidentListFilters (or equivalent filters type)`);
    }
    for (const key of ["driver_id", "unit_id", "date_from", "date_to"]) {
      if (!api.includes(key)) {
        f.push(`${API}: listSafetyIncidents must wire query param ${key}`);
      }
    }
  }

  if (!routes) {
    f.push(`${ROUTES}: missing`);
  } else {
    for (const key of ["driver_id", "unit_id", "date_from", "date_to"]) {
      if (!routes.includes(key)) {
        f.push(`${ROUTES}: GET list schema/SQL must accept ${key}`);
      }
    }
    if (!/i\.driver_id\s*=/.test(routes)) {
      f.push(`${ROUTES}: SQL must filter i.driver_id when provided`);
    }
    if (!/i\.unit_id\s*=/.test(routes)) {
      f.push(`${ROUTES}: SQL must filter i.unit_id when provided`);
    }
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    surface: read(SURFACE),
    api: read(API),
    routes: read(ROUTES),
  });
}

if (process.argv.includes("--selftest")) {
  const goodSurface = `
    const listFilters = useMemo(() => ({ driver_id, unit_id, date_from, date_to }), []);
    queryFn: () => listSafetyIncidents(operatingCompanyId, config.incidentType, listFilters),
    const listState = useListState(listQuery, rows.length === 0);
    data-testid={\`\${config.pageTestId}-filter-driver\`}
    data-testid={\`\${config.pageTestId}-filter-unit\`}
    data-testid="safety-incidents-from-date"
    data-testid="safety-incidents-to-date"
  `;
  const goodApi = `
    export type SafetyIncidentListFilters = { driver_id?: string; unit_id?: string; date_from?: string; date_to?: string };
    qs.set("driver_id", filters.driver_id);
    qs.set("unit_id", filters.unit_id);
    qs.set("date_from", filters.date_from);
    qs.set("date_to", filters.date_to);
  `;
  const goodRoutes = `
    driver_id: z.string().uuid().optional(),
    unit_id: z.string().uuid().optional(),
    date_from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
    date_to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
    filters.push(\`i.driver_id = $\${params.length}\`);
    filters.push(\`i.unit_id = $\${params.length}\`);
  `;
  const bad = check({ surface: "no filters", api: "listSafetyIncidents()", routes: "app.get" });
  if (bad.length < 3) {
    console.error(`${LABEL} SELFTEST FAIL: expected multiple failures on empty fixtures, got ${bad.length}`);
    process.exit(1);
  }
  const ok = check({ surface: goodSurface, api: goodApi, routes: goodRoutes });
  if (ok.length) {
    console.error(`${LABEL} SELFTEST FAIL:\n${ok.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  // Legacy pageTestId-prefixed date markers must still pass (S-08 shipped shape).
  const legacyOk = check({
    surface: goodSurface
      .replace('data-testid="safety-incidents-from-date"', 'data-testid={`${config.pageTestId}-filter-date-from`}')
      .replace('data-testid="safety-incidents-to-date"', 'data-testid={`${config.pageTestId}-filter-date-to`}'),
    api: goodApi,
    routes: goodRoutes,
  });
  if (legacyOk.length) {
    console.error(`${LABEL} SELFTEST FAIL (legacy):\n${legacyOk.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
