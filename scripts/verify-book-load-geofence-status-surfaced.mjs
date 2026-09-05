#!/usr/bin/env node
// Inv #40 (STANDING-DIRECTIVES-2026-09-05.md §CC-2 item 1, D5): "On book, fire the geofence
// create and show it." The create/enqueue/persist chain is guarded separately
// (verify-book-load-geofence-service-layer.mjs); this guard pins the "show it" half -- a
// tenant-scoped read endpoint and a Load Detail field that reads it, source-scan, comments
// masked, so a future refactor can't quietly drop either end without a red.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-geofence-status-surfaced";
const ROUTE = "apps/backend/src/dispatch/loads.routes.ts";
const API_CLIENT = "apps/frontend/src/api/dispatch.ts";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

function read(rel, root = ROOT) {
  return maskComments(readFileSync(join(root, rel), "utf8"));
}

export function collectProblems(root = ROOT) {
  const problems = [];
  const files = {};
  for (const [key, rel] of Object.entries({ route: ROUTE, apiClient: API_CLIENT, drawer: DRAWER })) {
    try {
      files[key] = read(rel, root);
    } catch {
      problems.push(`missing ${rel}`);
    }
  }
  if (problems.length) return problems;
  const { route, apiClient, drawer } = files;

  // Backend: the endpoint must exist, be tenant-scoped (withCompanyScope, the same pattern
  // every other per-load read in this file uses), and report both halves of "what happened" --
  // whether a geofence exists AND whether the stop even had coordinates to try with (so a
  // legitimately-skipped stop reads as explained state, not as a bug).
  if (!/app\.get\(\s*"\/api\/v1\/dispatch\/loads\/:id\/geofence-status"/.test(route)) {
    problems.push(`${ROUTE}: missing GET /api/v1/dispatch/loads/:id/geofence-status route`);
  }
  if (!/geofence-status[\s\S]{0,600}withCompanyScope/.test(route)) {
    problems.push(`${ROUTE}: the geofence-status route must read through withCompanyScope (tenant-scoped), like every other per-load route in this file`);
  }
  if (!/has_coordinates/.test(route) || !/geofence_created/.test(route)) {
    problems.push(`${ROUTE}: geofence-status response must report both has_coordinates and geofence_created per stop`);
  }

  // Frontend: a typed client function hitting that exact path.
  if (!/\/api\/v1\/dispatch\/loads\/\$\{id\}\/geofence-status/.test(apiClient)) {
    problems.push(`${API_CLIENT}: missing a client function calling GET .../loads/:id/geofence-status`);
  }

  // Frontend: Load Detail must actually render the result, not just fetch it into an unused
  // query -- the standing directive's ask was to SHOW it.
  if (!/getDispatchLoadGeofenceStatus/.test(drawer)) {
    problems.push(`${DRAWER}: must call getDispatchLoadGeofenceStatus (fetch without a caller is not "showing" anything)`);
  }
  if (!/data-testid="load-detail-geofence-status"/.test(drawer)) {
    problems.push(`${DRAWER}: must render a geofence-status field (data-testid="load-detail-geofence-status") the user can actually see`);
  }
  if (!/missingCoordinates/.test(drawer)) {
    problems.push(`${DRAWER}: must surface the missing-coordinates case explicitly -- a stop skipped for a real reason must read as explained, never blank`);
  }

  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);

  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");

  const GOOD = {
    [ROUTE]: [
      `app.get("/api/v1/dispatch/loads/:id/geofence-status", {}, async (req, reply) => {`,
      `  const result = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {`,
      `    return { has_coordinates: true, geofence_created: true };`,
      `  });`,
      `});`,
    ].join("\n"),
    [API_CLIENT]: `export function getDispatchLoadGeofenceStatus(id, operatingCompanyId) { return apiRequest(\`/api/v1/dispatch/loads/\${id}/geofence-status\`); }`,
    [DRAWER]: [
      `import { getDispatchLoadGeofenceStatus } from "../../api/dispatch";`,
      `function LoadDetailDrawer() {`,
      `  const q = useQuery({ queryFn: () => getDispatchLoadGeofenceStatus(load.id, load.operating_company_id) });`,
      `  return <span data-testid="load-detail-geofence-status">{missingCoordinates}</span>;`,
      `}`,
    ].join("\n"),
  };

  function writeFixture(tmpRoot, overrides = {}) {
    for (const [rel, content] of Object.entries(GOOD)) {
      const full = path.join(tmpRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, overrides[rel] ?? content);
    }
  }

  const cases = [
    { name: "good fixture", overrides: {}, expectProblems: 0 },
    { name: "route missing", overrides: { [ROUTE]: `// nothing here` }, expectProblems: 3 },
    { name: "route not tenant-scoped", overrides: { [ROUTE]: `app.get("/api/v1/dispatch/loads/:id/geofence-status", {}, async () => { return { has_coordinates: true, geofence_created: true }; });` }, expectProblems: 1 },
    { name: "api client missing", overrides: { [API_CLIENT]: `// nothing here` }, expectProblems: 1 },
    { name: "drawer fetches but never renders", overrides: { [DRAWER]: `import { getDispatchLoadGeofenceStatus } from "../../api/dispatch";\nfunction X() { void getDispatchLoadGeofenceStatus; }` }, expectProblems: 2 },
  ];

  for (const { name, overrides, expectProblems } of cases) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "book-load-geofence-status-guard-"));
    try {
      writeFixture(tmpRoot, overrides);
      const problems = collectProblems(tmpRoot);
      if (problems.length !== expectProblems) {
        console.error(
          `${LABEL} SELFTEST FAIL: case "${name}" expected ${expectProblems} problem(s), got ${problems.length}: ${JSON.stringify(problems)}`
        );
        process.exit(1);
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
  console.log(`${LABEL} SELFTEST OK (${cases.length}/${cases.length} cases)`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — geofence-status is tenant-scoped, fetched, and rendered on Load Detail`);
}
