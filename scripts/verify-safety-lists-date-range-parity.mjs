#!/usr/bin/env node
/**
 * verify-safety-lists-date-range-parity.mjs — s-04-no-from-to-date-range-safety-lists
 *
 * AccidentsPage ships From/To DatePickers (accidents-from-date / accidents-to-date).
 * SafetyIncidentsClusterSurface (damage-reports / trailer-interchange lists) must
 * expose the same AccidentsPage-parity pair (safety-incidents-from-date / to-date)
 * and wire them into the list fetch (date_from / date_to query params).
 *
 * Usage:
 *   node scripts/verify-safety-lists-date-range-parity.mjs
 *   node scripts/verify-safety-lists-date-range-parity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-lists-date-range-parity";
const ACCIDENTS = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
const SURFACE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const API = "apps/frontend/src/api/safety.ts";
const ROUTES = "apps/backend/src/safety/incidents.routes.ts";

/** @param {{ accidents: string|null, surface: string|null, api: string|null, routes: string|null }} src */
export function check(src) {
  const f = [];

  if (!src.accidents) {
    f.push(`${ACCIDENTS}: missing`);
  } else {
    if (!src.accidents.includes('data-testid="accidents-from-date"')) {
      f.push(`${ACCIDENTS}: must keep accidents-from-date DatePicker`);
    }
    if (!src.accidents.includes('data-testid="accidents-to-date"')) {
      f.push(`${ACCIDENTS}: must keep accidents-to-date DatePicker`);
    }
  }

  if (!src.surface) {
    f.push(`${SURFACE}: missing`);
  } else {
    if (!src.surface.includes('data-testid="safety-incidents-from-date"')) {
      f.push(`${SURFACE}: must expose safety-incidents-from-date (AccidentsPage parity)`);
    }
    if (!src.surface.includes('data-testid="safety-incidents-to-date"')) {
      f.push(`${SURFACE}: must expose safety-incidents-to-date (AccidentsPage parity)`);
    }
    if (!/fromDate/.test(src.surface) || !/toDate/.test(src.surface)) {
      f.push(`${SURFACE}: must hold fromDate/toDate state like AccidentsPage`);
    }
    if (!src.surface.includes("date_from") || !src.surface.includes("date_to")) {
      f.push(`${SURFACE}: must wire fromDate/toDate into date_from/date_to list filters`);
    }
    if (!src.surface.includes("listSafetyIncidents(operatingCompanyId, config.incidentType, listFilters)")) {
      f.push(`${SURFACE}: must pass listFilters into listSafetyIncidents`);
    }
  }

  if (!src.api) {
    f.push(`${API}: missing`);
  } else if (!src.api.includes("date_from") || !src.api.includes("date_to")) {
    f.push(`${API}: listSafetyIncidents must accept date_from/date_to query params`);
  }

  if (!src.routes) {
    f.push(`${ROUTES}: missing`);
  } else {
    if (!src.routes.includes("date_from") || !src.routes.includes("date_to")) {
      f.push(`${ROUTES}: GET /api/v1/safety/incidents must accept date_from/date_to`);
    }
    if (!/incident_at[\s\S]*date_from|date_from[\s\S]*incident_at/.test(src.routes)) {
      f.push(`${ROUTES}: date_from must filter on incident_at`);
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
    accidents: read(ACCIDENTS),
    surface: read(SURFACE),
    api: read(API),
    routes: read(ROUTES),
  });
}

if (process.argv.includes("--selftest")) {
  const good = {
    accidents: `
      <DatePicker data-testid="accidents-from-date" />
      <DatePicker data-testid="accidents-to-date" />
    `,
    surface: `
      const [fromDate, setFromDate] = useState("");
      const [toDate, setToDate] = useState("");
      const listFilters = useMemo(() => ({ date_from: fromDate, date_to: toDate }), [fromDate, toDate]);
      queryFn: () => listSafetyIncidents(operatingCompanyId, config.incidentType, listFilters),
      data-testid="safety-incidents-from-date"
      data-testid="safety-incidents-to-date"
    `,
    api: `qs.set("date_from", filters.date_from); qs.set("date_to", filters.date_to);`,
    routes: `
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      filters.push(\`(i.incident_at AT TIME ZONE 'UTC')::date >= $\${params.length}::date\`);
    `,
  };
  const bad = check({ accidents: "x", surface: "no dates", api: "list()", routes: "app.get" });
  if (bad.length < 3) {
    console.error(`${LABEL} SELFTEST FAIL: expected multiple failures, got ${bad.length}`);
    process.exit(1);
  }
  const ok = check(good);
  if (ok.length) {
    console.error(`${LABEL} SELFTEST FAIL:\n${ok.map((e) => `  - ${e}`).join("\n")}`);
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
