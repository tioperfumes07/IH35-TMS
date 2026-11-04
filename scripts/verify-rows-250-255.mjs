#!/usr/bin/env node
/**
 * verify-rows-250-255.mjs — register rows 250 (D074) + 255 (D079).
 *
 * Row 250 — Dispatch › Truck Line initial requests were slow (prod capture: truck-line 11,425 ms,
 * units-without-load 4,810 / 8,819 ms, positions/latest 4,193 ms, detention/board 3,217 ms).
 * Measured root causes (prod EXPLAIN ANALYZE, USMCA):
 *   R1 units-without-load: a DISTINCT ON CTE over every USMCA telematics.vehicle_locations row
 *      (566,392 rows, seq scan + 47 MB on-disk sort) = 3,081 ms per call. The fallback city must be a
 *      LATERAL gated INSIDE its WHERE on "cache has no city" with the constant company key.
 *   R2 truck-line: the same fallback lateral was gated at JOIN level (`loc ON (p.city IS NULL ...)`),
 *      which still runs the subquery per row (4,349 ms on the unit set); latest_hos CTE inlined and
 *      re-ran per unit.
 *   R3 two pool checkouts per request (string-overload assertCompanyMembership / sync-then-read)
 *      on a 5-connection pool, so the page's cheap reads (positions 0.3 ms SQL, detention 0.1 ms SQL)
 *      queued for seconds.
 *   R4 the page fired units-without-load twice (Dispatch.tsx + DispatchSubnav under different keys).
 * Row 255 — Per-Customer P&L flags must render through the ONE shared label map.
 *
 *   node scripts/verify-rows-250-255.mjs             # scan the live tree
 *   node scripts/verify-rows-250-255.mjs --selftest  # plant each defect back; every one must FAIL
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const F = {
  loads: "apps/backend/src/dispatch/loads.routes.ts",
  truckLine: "apps/backend/src/dispatch/truck-line/truck-line.routes.ts",
  detention: "apps/backend/src/dispatch/detention.service.ts",
  apiDispatch: "apps/frontend/src/api/dispatch.ts",
  subnav: "apps/frontend/src/components/dispatch/DispatchSubnav.tsx",
  dispatchPage: "apps/frontend/src/pages/Dispatch.tsx",
  customerDetail: "apps/frontend/src/pages/CustomerDetail.tsx",
  profitabilityPage: "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx",
  flagLabels: "apps/frontend/src/lib/formatCustomerProfitabilityFlagLabel.ts",
  profitRoutes: "apps/backend/src/reports/customer-profitability.routes.ts",
};
const UWL_READERS = [
  "apps/frontend/src/pages/Dispatch.tsx",
  "apps/frontend/src/components/dispatch/DispatchSubnav.tsx",
  "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
  "apps/frontend/src/pages/dispatch/RoundTrips.tsx",
  "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
  "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx",
  "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function handlerBody(src, routeLiteral) {
  const start = src.indexOf(routeLiteral);
  if (start < 0) return "";
  const next = src.indexOf("app.get(", start + routeLiteral.length);
  const nextPost = src.indexOf("app.post(", start + routeLiteral.length);
  const ends = [next, nextPost].filter((n) => n > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

function fnBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return "";
  const next = src.indexOf("\nexport ", start + signature.length);
  return src.slice(start, next > 0 ? next : undefined);
}

/** A location lateral is correct when its "no cached city" gate is INSIDE the subquery and it joins ON true. */
function locLateralGatedInside(sql) {
  const m = sql.match(/LEFT JOIN LATERAL \(([\s\S]*?)\)\s*loc\s+ON\s+([^\n]+)/);
  if (!m) return false;
  return /p\.city IS NULL AND p\.state IS NULL/.test(m[1]) && /^true\b/.test(m[2].trim());
}

export function check(files) {
  const errors = [];
  // R1 — units-without-load.
  const uwl = handlerBody(files[F.loads], '"/api/v1/dispatch/units-without-load"');
  if (!uwl) errors.push(`${F.loads}: units-without-load handler not found`);
  if (/DISTINCT ON \(g\.unit_id\)[\s\S]{0,200}FROM telematics\.vehicle_locations/.test(uwl) || /last_city_per_unit/.test(uwl))
    errors.push(`${F.loads}: R1 units-without-load scans every vehicle_locations row (DISTINCT ON CTE) — use the gated LATERAL`);
  if (!locLateralGatedInside(uwl))
    errors.push(`${F.loads}: R1 units-without-load loc LATERAL must carry "p.city IS NULL AND p.state IS NULL" inside its WHERE and join ON true`);
  if (!/g\.operating_company_id = \$1::uuid/.test(uwl))
    errors.push(`${F.loads}: R1 units-without-load loc LATERAL must key vehicle_locations on the constant $1 company (idx_vehicle_locations_unit_time)`);

  // R2 — truck-line.
  const tl = files[F.truckLine];
  if (/\)\s*loc\s+ON\s*\(\s*p\.city IS NULL/.test(tl))
    errors.push(`${F.truckLine}: R2 loc LATERAL is gated at JOIN level — the subquery still runs per row`);
  if (!locLateralGatedInside(tl))
    errors.push(`${F.truckLine}: R2 loc LATERAL must carry the "no cached city" gate inside its WHERE and join ON true`);
  if (!/WITH latest_hos AS MATERIALIZED/.test(tl))
    errors.push(`${F.truckLine}: R2 latest_hos must be MATERIALIZED (inlined it re-ran once per unit)`);

  // R3 — one pool checkout per request.
  if (/withCompanyScope\(/.test(tl))
    errors.push(`${F.truckLine}: R3 withCompanyScope takes a second pool checkout for membership — use withCurrentUser + setScopedCompanyContext`);
  const localScope = fnBody(files[F.loads], "async function withCompanyScope<T>(");
  if (!localScope) errors.push(`${F.loads}: local withCompanyScope not found`);
  if (/await assertCompanyMembership\(userId, operatingCompanyId\)/.test(localScope) || !/assertCompanyMembership\(client,/.test(localScope))
    errors.push(`${F.loads}: R3 local withCompanyScope must check membership on the SAME client (one checkout)`);
  const board = fnBody(files[F.detention], "export async function listDetentionBoard(");
  if (!board) errors.push(`${F.detention}: listDetentionBoard not found`);
  if (/syncDetentionEventsFromStopArrivals\(/.test(board))
    errors.push(`${F.detention}: R3 listDetentionBoard runs the sync on its own checkout — call syncDetentionEventsInClient on the board's client`);
  if (!/syncDetentionEventsInClient\(client,/.test(board))
    errors.push(`${F.detention}: R3 listDetentionBoard must run the throttled sync on its own client`);

  // R4 — one query key for units-without-load.
  if (!/export function unitsWithoutLoadQueryKey\(/.test(files[F.apiDispatch]))
    errors.push(`${F.apiDispatch}: R4 unitsWithoutLoadQueryKey export missing`);
  for (const rel of UWL_READERS) {
    const src = files[rel];
    const reads = (src.match(/queryFn:\s*\(\)\s*=>\s*listUnitsWithoutLoad\(/g) ?? []).length;
    const keyed = (src.match(/queryKey:\s*unitsWithoutLoadQueryKey\(/g) ?? []).length;
    if (reads === 0) errors.push(`${rel}: R4 expected a listUnitsWithoutLoad reader (file moved? update UWL_READERS)`);
    if (keyed < reads) errors.push(`${rel}: R4 ${reads} listUnitsWithoutLoad reader(s) but ${keyed} use unitsWithoutLoadQueryKey — a private key re-fires the request`);
  }

  // Row 255 — Per-Customer P&L flags through the ONE shared label map.
  const labels = files[F.flagLabels];
  const tokens = [...(files[F.profitRoutes].match(/type ProfitFlag = ([^;]+);/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  if (tokens.length === 0) errors.push(`${F.profitRoutes}: ProfitFlag union not found`);
  for (const t of tokens) {
    if (!new RegExp(`\\b${t}:\\s*"[A-Z][^"]*"`).test(labels)) errors.push(`${F.flagLabels}: row 255 no human label for backend flag "${t}"`);
  }
  for (const rel of [F.customerDetail, F.profitabilityPage]) {
    const src = files[rel];
    if (!/from "[./]*lib\/formatCustomerProfitabilityFlagLabel"/.test(src))
      errors.push(`${rel}: row 255 must import the shared flag label map`);
    if (/\.flags \?\? \[\]\)\.map\(\(f\) => \(\s*<span[^>]*>\s*\{f\}\s*<\/span>/.test(src))
      errors.push(`${rel}: row 255 renders a raw flag token ({f}) — use formatCustomerProfitabilityFlagLabel(f)`);
  }
  const cdFlags = files[F.customerDetail].match(/customerPnlRow\.flags \?\? \[\]\)\.map\(\(f\) => \(([\s\S]*?)\)\)\}/)?.[1] ?? "";
  if (!/formatCustomerProfitabilityFlagLabel\(f\)/.test(cdFlags))
    errors.push(`${F.customerDetail}: row 255 Per-Customer P&L flag chips must render formatCustomerProfitabilityFlagLabel(f)`);
  return errors;
}

function loadFiles() {
  const files = {};
  for (const rel of new Set([...Object.values(F), ...UWL_READERS])) files[rel] = read(rel);
  return files;
}

function selftest() {
  const base = loadFiles();
  const clean = check(base);
  if (clean.length) {
    console.error("verify-rows-250-255 selftest: live tree is not clean:\n  " + clean.join("\n  "));
    process.exit(1);
  }
  const plant = (rel, from, to) => {
    const files = { ...base };
    if (!files[rel].includes(from)) throw new Error(`selftest anchor missing in ${rel}: ${from.slice(0, 60)}`);
    files[rel] = files[rel].replace(from, to);
    return files;
  };
  const cases = [
    ["R1 unbounded DISTINCT ON CTE", plant(F.loads, "          LEFT JOIN LATERAL (\n            SELECT g.city, g.state, g.formatted_location\n              FROM telematics.vehicle_locations g\n             WHERE p.city IS NULL AND p.state IS NULL",
      "          LEFT JOIN last_city_per_unit loc0 ON true LEFT JOIN LATERAL (\n            SELECT DISTINCT ON (g.unit_id) g.city, g.state, g.formatted_location\n              FROM telematics.vehicle_locations g\n             WHERE true")],
    ["R1 gate outside lateral", plant(F.loads, "             WHERE p.city IS NULL AND p.state IS NULL\n               AND g.operating_company_id = $1::uuid", "             WHERE g.operating_company_id = $1::uuid")],
    ["R2 join-level gate", plant(F.truckLine, ") loc ON true", ") loc ON (p.city IS NULL AND p.state IS NULL)")],
    ["R2 inlined latest_hos", plant(F.truckLine, "WITH latest_hos AS MATERIALIZED (", "WITH latest_hos AS (")],
    ["R3 truck-line double checkout", plant(F.truckLine, "const payload = await withCurrentUser(user.uuid, async (client) => {", "const payload = await withCompanyScope(user.uuid, operating_company_id, async (client) => {")],
    ["R3 loads scope double checkout", plant(F.loads, "  return withCurrentUser(userId, async (client) => {\n    await assertCompanyMembership(client, userId, operatingCompanyId);", "  await assertCompanyMembership(userId, operatingCompanyId);\n  return withCurrentUser(userId, async (client) => {")],
    ["R3 detention sync on own checkout", plant(F.detention, "if (syncDue) await syncDetentionEventsInClient(client, operatingCompanyId);", "if (syncDue) await syncDetentionEventsFromStopArrivals(userId, operatingCompanyId);")],
    ["R4 subnav private key", plant(F.subnav, "queryKey: unitsWithoutLoadQueryKey(operatingCompanyId),", 'queryKey: ["dispatch-subnav", "unassigned", operatingCompanyId],')],
    ["R4 dispatch page private key", plant(F.dispatchPage, "queryKey: unitsWithoutLoadQueryKey(selectedCompanyId),", 'queryKey: ["dispatch", "units-without-load", selectedCompanyId],')],
    ["255 raw flag token", plant(F.customerDetail, "{formatCustomerProfitabilityFlagLabel(f)}", "{f}")],
    ["255 missing label", plant(F.flagLabels, '  past_due: "Past due",\n', "")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    const errs = check(files);
    if (errs.length === 0) console.error(`selftest MISSED: ${name}`);
    else caught += 1;
  }
  console.log(`verify-rows-250-255 selftest: ${caught}/${cases.length} planted defects caught`);
  process.exit(caught === cases.length ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const errors = check(loadFiles());
  if (errors.length) {
    console.error("verify-rows-250-255 FAIL:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  console.log("verify-rows-250-255: OK — rows 250 (Truck Line reads set-based, one checkout, one units-without-load key) and 255 (P&L flag labels)");
}
