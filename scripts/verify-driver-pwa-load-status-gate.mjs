#!/usr/bin/env node
// 0243-g9-h4 — driver PWA arrival/departure must funnel mdata.loads.status writes through
// validateLoadStopStatusWrite (same gate as dispatch-view.routes.ts and bulk/transition paths).
//
// ROUND 18.2 (2026-09-11): #21859 (TRUCK LINE) extracted dispatch-view.routes.ts's arrival/
// departure SQL into the shared apps/backend/src/dispatch/stop-stamp.service.ts (so the office-
// facing Truck Line stop-stamp route can reuse the IDENTICAL write path instead of a private
// reimplementation). The invariants below did not move or weaken — they moved FILE. This guard
// now asserts them where they actually live: the compare-and-set UPDATEs, the already-recorded/
// lost-transition rejections, and the company-bound params live in stop-stamp.service.ts; the row
// lock (FOR UPDATE OF s, l) and the authorization JOIN stay in each route's own SELECT (a caller
// still owns its own row lock + authorization). Each route block is additionally asserted to (a)
// delegate to the shared stampStopArrival/stampStopDeparture and (b) contain NO direct
// `UPDATE mdata.loads` of its own — the negative assertion that keeps this protection real after
// an extraction: a route cannot quietly re-inline a second, un-audited write path.
// driver/loads.routes.ts was NOT touched by that refactor — it still inlines its own arrival/
// departure SQL independently, so its checks are unchanged.
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

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

// Unchanged — used only for driver/loads.routes.ts, which still inlines everything itself.
function auditScopedStatusHandlers(relativePath, content, handlers) {
  const issues = [];
  for (const { label, start, end } of handlers) {
    const from = content.lastIndexOf(start);
    const to = end ? content.indexOf(end, from + start.length) : content.length;
    const block = from < 0 ? "" : content.slice(from, to < 0 ? content.length : to);
    const require = (pattern, message) => {
      if (!pattern.test(block)) issues.push(`${relativePath}: ${label} ${message}`);
    };
    require(/l\.operating_company_id::text AS operating_company_id/, "must capture immutable load company");
    require(/company_id = l\.operating_company_id/, "must admit only same-company or actively authorized drivers");
    require(/is_authorized = true/, "must require active shared-driver authorization");
    require(/deactivated_at IS NULL/, "must reject deactivated shared-driver authorization");
    require(
      /UPDATE mdata\.loads\s+SET status = \$2\s+WHERE id = \$1\s+AND operating_company_id = \$3::uuid/,
      "status UPDATE must bind exact captured company"
    );
    require(
      /\[params\.data\.(?:id|uuid), nextLoadStatus, stop\.operating_company_id(?:, stop\.load_status)?\]/,
      "status UPDATE parameters must use the captured load company"
    );
  }
  return issues;
}

function auditDriverArrivalLifecycle(content) {
  const from = content.indexOf("/api/v1/driver/loads/:id/stops/:stopId/arrive");
  const to = content.indexOf("/api/v1/driver/loads/:id/stops/:stopId/depart", from);
  const block = from < 0 ? "" : content.slice(from, to);
  const issues = [];
  const require = (pattern, message) => {
    if (!pattern.test(block)) issues.push(`apps/backend/src/driver/loads.routes.ts: arrival ${message}`);
  };
  require(/FOR UPDATE OF s, l/, "must lock the stop and load before lifecycle validation");
  require(/actual_arrival_at IS NULL[\s\S]*?RETURNING id/, "must compare-and-set the first arrival stamp");
  require(/if \(!arrivalUpdate\.rows\[0\]\?\.id\) return \{ error: "arrival_already_recorded" as const \}/, "must reject an already-recorded arrival");
  require(/AND status::text = \$4[\s\S]*?RETURNING id/, "must compare-and-set the validated load status");
  require(/if \(!loadUpdate\.rows\[0\]\?\.id\) return \{ error: "load_transition_conflict" as const \}/, "must reject a lost load transition");
  return issues;
}

function auditDepartureLifecycle(relativePath, content, start, end) {
  const from = content.lastIndexOf(start);
  const to = end ? content.indexOf(end, from + start.length) : content.length;
  const block = from < 0 ? "" : content.slice(from, to < 0 ? content.length : to);
  const issues = [];
  const require = (pattern, message) => {
    if (!pattern.test(block)) issues.push(`${relativePath}: departure ${message}`);
  };
  require(/FOR UPDATE OF s, l/, "must lock the stop and load before lifecycle validation");
  require(/actual_departure_at IS NULL[\s\S]*?RETURNING id/, "must compare-and-set the first departure stamp");
  require(/if \(!departureUpdate\.rows\[0\]\?\.id\) return \{ error: "departure_already_recorded" as const \}/, "must reject a duplicate departure before side effects");
  require(/AND status::text = \$4[\s\S]*?RETURNING id/, "must compare-and-set the validated load status");
  require(/if \(!loadUpdate\.rows\[0\]\?\.id\) return \{ error: "load_transition_conflict" as const \}/, "must reject a lost load transition before side effects");
  return issues;
}

// NEW (ROUND 18.2) — dispatch-view.routes.ts's arrival/departure route blocks now delegate their
// write path to the shared service. Assert (a) the row lock + authorization JOIN stay local to
// the route, (b) the route DELEGATES to the shared stamp function, and (c) the route contains NO
// direct `UPDATE mdata.loads` of its own (the negative assertion — a route cannot quietly
// reintroduce a second, un-audited write path).
function auditDispatchRouteDelegates(content, { label, start, end, fn }) {
  const from = content.lastIndexOf(start);
  const to = end ? content.indexOf(end, from + start.length) : content.length;
  const block = from < 0 ? "" : content.slice(from, to < 0 ? content.length : to);
  const relativePath = "apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts";
  const issues = [];
  const require = (pattern, message) => {
    if (!pattern.test(block)) issues.push(`${relativePath}: ${label} ${message}`);
  };
  require(/l\.operating_company_id::text AS operating_company_id/, "must capture immutable load company");
  require(/company_id = l\.operating_company_id/, "must admit only same-company or actively authorized drivers");
  require(/is_authorized = true/, "must require active shared-driver authorization");
  require(/deactivated_at IS NULL/, "must reject deactivated shared-driver authorization");
  require(/FOR UPDATE OF s, l/, "must lock the stop and load before lifecycle validation");
  require(new RegExp(`await ${fn}\\(`), `must delegate to the shared ${fn} (stop-stamp.service.ts) rather than reinvent the write path`);
  if (/UPDATE\s+mdata\.loads\b/.test(block)) {
    issues.push(`${relativePath}: ${label} must not itself UPDATE mdata.loads — that write belongs only to the shared stop-stamp.service.ts`);
  }
  return issues;
}

// NEW (ROUND 18.2) — the invariants that moved into the shared service, asserted where they now
// live instead of on the (now-delegating) route file.
function auditServiceArrivalInvariants(serviceContent) {
  const from = serviceContent.indexOf("export async function stampStopArrival");
  const to = serviceContent.indexOf("export async function stampStopDeparture", from);
  const block = from < 0 ? "" : serviceContent.slice(from, to < 0 ? serviceContent.length : to);
  const relativePath = "apps/backend/src/dispatch/stop-stamp.service.ts";
  const issues = [];
  const require = (pattern, message) => {
    if (!pattern.test(block)) issues.push(`${relativePath}: stampStopArrival ${message}`);
  };
  require(/actual_arrival_at IS NULL[\s\S]*?RETURNING id/, "must compare-and-set the first arrival stamp");
  require(/if \(!arrivalUpdate\.rows\[0\]\?\.id\) return \{ ok: false, error: "arrival_already_recorded" \}/, "must reject an already-recorded arrival before audit");
  require(
    /UPDATE mdata\.loads\s+SET status = \$2\s+WHERE id = \$1\s+AND operating_company_id = \$3::uuid/,
    "status UPDATE must bind exact captured company"
  );
  require(/AND status::text = \$4[\s\S]*?RETURNING id/, "must compare-and-set the validated load status");
  require(/if \(!loadUpdate\.rows\[0\]\?\.id\) return \{ ok: false, error: "load_transition_conflict" \}/, "must reject a lost load transition before audit");
  require(
    /\[ctx\.loadId, nextLoadStatus, stop\.operating_company_id, stop\.load_status\]/,
    "status UPDATE parameters must use the captured load company"
  );
  return issues;
}

function auditServiceDepartureInvariants(serviceContent) {
  const from = serviceContent.indexOf("export async function stampStopDeparture");
  const block = from < 0 ? "" : serviceContent.slice(from);
  const relativePath = "apps/backend/src/dispatch/stop-stamp.service.ts";
  const issues = [];
  const require = (pattern, message) => {
    if (!pattern.test(block)) issues.push(`${relativePath}: stampStopDeparture ${message}`);
  };
  require(/actual_departure_at IS NULL[\s\S]*?RETURNING id/, "must compare-and-set the first departure stamp");
  require(/if \(!departureUpdate\.rows\[0\]\?\.id\) return \{ ok: false, error: "departure_already_recorded" \}/, "must reject a duplicate departure before side effects");
  require(
    /UPDATE mdata\.loads\s+SET status = \$2\s+WHERE id = \$1\s+AND operating_company_id = \$3::uuid/,
    "status UPDATE must bind exact captured company"
  );
  require(/AND status::text = \$4[\s\S]*?RETURNING id/, "must compare-and-set the validated load status");
  require(/if \(!loadUpdate\.rows\[0\]\?\.id\) return \{ ok: false, error: "load_transition_conflict" \}/, "must reject a lost load transition before side effects");
  require(
    /\[ctx\.loadId, nextLoadStatus, stop\.operating_company_id, stop\.load_status\]/,
    "status UPDATE parameters must use the captured load company"
  );
  return issues;
}

const driverLoads = read("apps/backend/src/driver/loads.routes.ts");
contains("apps/backend/src/driver/loads.routes.ts", driverLoads, [
  { pattern: /validateLoadStopStatusWrite/, label: "import shared load-status gate" },
  { pattern: /\/api\/v1\/driver\/loads\/:id\/stops\/:stopId\/arrive/, label: "arrive route" },
  { pattern: /\/api\/v1\/driver\/loads\/:id\/stops\/:stopId\/depart/, label: "depart route" },
  { pattern: /load_status/, label: "load_status selected before status write" },
  { pattern: /invalid_load_state/, label: "invalid_load_state rejection" },
]);

// Arrive + depart handlers must each call the gate before UPDATE mdata.loads
const arriveIdx = driverLoads.indexOf("/api/v1/driver/loads/:id/stops/:stopId/arrive");
const departIdx = driverLoads.indexOf("/api/v1/driver/loads/:id/stops/:stopId/depart");
const arriveBlock = arriveIdx >= 0 ? driverLoads.slice(arriveIdx, departIdx) : "";
const departBlock = departIdx >= 0 ? driverLoads.slice(departIdx) : "";
for (const [label, block] of [
  ["arrive", arriveBlock],
  ["depart", departBlock],
]) {
  if (!block.includes("validateLoadStopStatusWrite")) {
    fail(`apps/backend/src/driver/loads.routes.ts: ${label} handler missing validateLoadStopStatusWrite`);
  }
  const gatePos = block.indexOf("validateLoadStopStatusWrite");
  const updatePos = block.search(/UPDATE mdata\.loads\s+SET status/);
  if (gatePos < 0 || updatePos < 0 || gatePos > updatePos) {
    fail(`apps/backend/src/driver/loads.routes.ts: ${label} must call gate before UPDATE mdata.loads`);
  }
}

const dispatchView = read("apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts");
const stopStampService = read("apps/backend/src/dispatch/stop-stamp.service.ts");

// The dispatch-view parity gate (validateLoadStopStatusWrite) is satisfied either inline or by
// delegating to the shared stop-stamp.service.ts, which is the current, honest shape — a route
// that imports and calls the shared stampStopArrival/stampStopDeparture functions is reachable
// through the SAME gate those functions themselves call.
const dispatchDelegates = /\bstampStopArrival\b/.test(dispatchView) && /\bstampStopDeparture\b/.test(dispatchView);
const dispatchParityOk =
  /validateLoadStopStatusWrite/.test(dispatchView) ||
  (dispatchDelegates && /validateLoadStopStatusWrite/.test(stopStampService));
if (!dispatchParityOk) {
  fail(
    "apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts: missing dispatch-view parity gate " +
      "(validateLoadStopStatusWrite unreachable — neither inlined nor delegated through stop-stamp.service.ts)"
  );
}

const scopeIssues = [
  ...auditScopedStatusHandlers("apps/backend/src/driver/loads.routes.ts", driverLoads, [
    {
      label: "arrive",
      start: "/api/v1/driver/loads/:id/stops/:stopId/arrive",
      end: "/api/v1/driver/loads/:id/stops/:stopId/depart",
    },
    { label: "depart", start: "/api/v1/driver/loads/:id/stops/:stopId/depart" },
  ]),
  ...auditDispatchRouteDelegates(dispatchView, {
    label: "arrival",
    start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival",
    end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure",
    fn: "stampStopArrival",
  }),
  ...auditDispatchRouteDelegates(dispatchView, {
    label: "departure",
    start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure",
    end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document",
    fn: "stampStopDeparture",
  }),
];
for (const issue of scopeIssues) fail(issue);

const arrivalLifecycleIssues = auditServiceArrivalInvariants(stopStampService);
for (const issue of arrivalLifecycleIssues) fail(issue);
const driverArrivalLifecycleIssues = auditDriverArrivalLifecycle(driverLoads);
for (const issue of driverArrivalLifecycleIssues) fail(issue);
const departureLifecycleIssues = [
  ...auditDepartureLifecycle(
    "apps/backend/src/driver/loads.routes.ts",
    driverLoads,
    "/api/v1/driver/loads/:id/stops/:stopId/depart"
  ),
  ...auditServiceDepartureInvariants(stopStampService),
];
for (const issue of departureLifecycleIssues) fail(issue);

if (process.argv.includes("--selftest")) {
  const brokenDriver = driverLoads
    .replaceAll("l.operating_company_id::text AS operating_company_id", "NULL::text AS operating_company_id")
    .replaceAll("AND operating_company_id = $3::uuid", "")
    .replaceAll(".is_authorized = true", ".is_authorized = false");
  const brokenDispatch = dispatchView
    .replaceAll("l.operating_company_id::text AS operating_company_id", "NULL::text AS operating_company_id")
    .replaceAll("AND operating_company_id = $3::uuid", "")
    .replaceAll(".deactivated_at IS NULL", ".deactivated_at IS NOT NULL");
  const planted = [
    ...auditScopedStatusHandlers("driver", brokenDriver, [
      { label: "arrive", start: "/api/v1/driver/loads/:id/stops/:stopId/arrive", end: "/api/v1/driver/loads/:id/stops/:stopId/depart" },
      { label: "depart", start: "/api/v1/driver/loads/:id/stops/:stopId/depart" },
    ]),
    ...auditDispatchRouteDelegates(brokenDispatch, {
      label: "arrival",
      start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival",
      end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure",
      fn: "stampStopArrival",
    }),
    ...auditDispatchRouteDelegates(brokenDispatch, {
      label: "departure",
      start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure",
      end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document",
      fn: "stampStopDeparture",
    }),
  ];

  // Route-level mutation: re-inline a loads-status write in the (now-delegating) dispatch-view
  // arrival route — must be caught by the negative UPDATE mdata.loads assertion.
  const reinlinedWrite = dispatchView.replace(
    "const result = await stampStopArrival(client, stop, {",
    'await client.query("UPDATE mdata.loads SET status = \'at_pickup\' WHERE id = $1", [params.data.uuid]);\n      const result = await stampStopArrival(client, stop, {'
  );
  const reinlineCaught =
    auditDispatchRouteDelegates(reinlinedWrite, {
      label: "arrival",
      start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival",
      end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure",
      fn: "stampStopArrival",
    }).length > 0;
  if (reinlinedWrite === dispatchView) {
    console.error("verify:driver-pwa-load-status-gate SELFTEST FAILED — reinline mutation changed nothing");
    process.exit(1);
  }

  const arrivalMutations = [
    stopStampService.replace("AND actual_arrival_at IS NULL", ""),
    stopStampService.replace('if (!arrivalUpdate.rows[0]?.id) return { ok: false, error: "arrival_already_recorded" };', ""),
    stopStampService.replace("AND status::text = $4", ""),
    stopStampService.replace('if (!loadUpdate.rows[0]?.id) return { ok: false, error: "load_transition_conflict" };', ""),
  ];
  const arrivalMutationsFail = arrivalMutations.every((mutant) => {
    if (mutant === stopStampService) return false; // mutation must actually change something
    return auditServiceArrivalInvariants(mutant).length > 0;
  });
  const driverArrivalMutations = [
    driverLoads.replaceAll("FOR UPDATE OF s, l", ""),
    driverLoads.replace("AND actual_arrival_at IS NULL", ""),
    driverLoads.replace('if (!arrivalUpdate.rows[0]?.id) return { error: "arrival_already_recorded" as const };', ""),
    driverLoads.replace("AND status::text = $4", ""),
    driverLoads.replace('if (!loadUpdate.rows[0]?.id) return { error: "load_transition_conflict" as const };', ""),
  ];
  const driverArrivalMutationsFail = driverArrivalMutations.every((mutant) => {
    if (mutant === driverLoads) return false;
    return auditDriverArrivalLifecycle(mutant).length > 0;
  });
  const departureMutations = [
    // stop-stamp.service.ts departure invariants
    stopStampService.replace("AND actual_departure_at IS NULL", ""),
    stopStampService.replace('if (!departureUpdate.rows[0]?.id) return { ok: false, error: "departure_already_recorded" };', ""),
    stopStampService.replaceAll("AND status::text = $4", ""),
    stopStampService.replaceAll('if (!loadUpdate.rows[0]?.id) return { ok: false, error: "load_transition_conflict" };', ""),
  ];
  const departureMutationsFail = departureMutations.every((mutant) => {
    if (mutant === stopStampService) return false;
    return auditServiceDepartureInvariants(mutant).length > 0;
  });
  const driverDepartureMutations = [
    driverLoads.replaceAll("FOR UPDATE OF s, l", ""),
    driverLoads.replace("AND actual_departure_at IS NULL", ""),
    driverLoads.replace('if (!departureUpdate.rows[0]?.id) return { error: "departure_already_recorded" as const };', ""),
    driverLoads.replaceAll("AND status::text = $4", ""),
    driverLoads.replaceAll('if (!loadUpdate.rows[0]?.id) return { error: "load_transition_conflict" as const };', ""),
  ];
  const driverDepartureMutationsFail = driverDepartureMutations.every((mutant) => {
    if (mutant === driverLoads) return false;
    return auditDepartureLifecycle(
      "apps/backend/src/driver/loads.routes.ts",
      mutant,
      "/api/v1/driver/loads/:id/stops/:stopId/depart"
    ).length > 0;
  });

  const totalIssues =
    scopeIssues.length + arrivalLifecycleIssues.length + driverArrivalLifecycleIssues.length + departureLifecycleIssues.length;
  if (
    totalIssues ||
    planted.length < 10 ||
    !reinlineCaught ||
    !arrivalMutationsFail ||
    !driverArrivalMutationsFail ||
    !departureMutationsFail ||
    !driverDepartureMutationsFail
  ) {
    console.error(
      `verify:driver-pwa-load-status-gate SELFTEST FAILED — realTreeIssues=${totalIssues}, planted=${planted.length}, ` +
        `reinlineCaught=${reinlineCaught}, arrivalMutations=${arrivalMutationsFail}, driverArrivalMutations=${driverArrivalMutationsFail}, ` +
        `departureMutations=${departureMutationsFail}, driverDepartureMutations=${driverDepartureMutationsFail}`
    );
    process.exit(1);
  }
  console.log(
    `verify:driver-pwa-load-status-gate SELFTEST PASS — ${planted.length} scope defects + reinline-write + ` +
      `${arrivalMutations.length} service-arrival + ${driverArrivalMutations.length} driver-arrival + ` +
      `${departureMutations.length} service-departure + ${driverDepartureMutations.length} driver-departure mutations all caught`
  );
  process.exit(0);
}

read("apps/backend/src/dispatch/load-state-machine.ts");

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:driver-pwa-load-status-gate/, label: "npm script for verify gate" },
]);

const lockedGuards = read(".github/workflows/locked-guards.yml");
contains(".github/workflows/locked-guards.yml", lockedGuards, [
  { pattern: /verify:driver-pwa-load-status-gate/, label: "locked-guards runs verify gate" },
]);

if (failures.length > 0) {
  console.error("verify:driver-pwa-load-status-gate — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:driver-pwa-load-status-gate — OK");
