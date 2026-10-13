#!/usr/bin/env node
// Inv #40 (owner order 2026-09-05, SAMSARA-CAPABILITIES-AND-INTEGRATION-PLAN-2026-09-05.md §4,
// D5; STANDING-DIRECTIVES-2026-09-05.md §CC-2 item 1, deadline 21:15Z): "Book Load -> place/
// geofence -> Samsara never happens... Guard asserts the book path invokes the geofence create +
// persists the external id."
//
// Source-scan, comments masked, four links in the one chain a booked load must walk:
//   1. bookLoad() (book-load.service.ts) invokes the trigger for EVERY caller, not only the HTTP
//      route (the original bug: only 6 of 57 loads had ever gone through the HTTP path).
//   2. the HTTP route must NOT also call it directly (would double-fire per HTTP-booked load).
//   3. auto-geofence.service.ts's autoCreateGeofencesForLoadWithClient enqueues the
//      'samsara.create_geofence' outbox event -- the actual "invokes the geofence create" step.
//   4. the outbox handler for that event type persists the returned Samsara address id back onto
//      geo.geofences (samsara_address_id) -- the "persists the external id" step.
// Links 3-4 already existed and are already unit-tested (auto-geofence-*.test.ts,
// samsara-create-geofence.handler.test.ts, all green) -- this guard's job is proving the WIRING
// between all four links holds, source-level, so a future refactor can't quietly break the chain
// without any single unit test catching it (each test only exercises its own link in isolation).
//
// NOT covered here (needs a live Neon measurement, and depends on the Book Load wizard actually
// writing stop lat/lng, which today it does for a manually-geocoded address but not from an
// offered Samsara-address pick -- confirmed stub: telematics/auto-geofence.service.ts's
// geocodeStopIfNeeded() always returns null, so a stop with no lat/lng and no location_id is
// permanently skipped, not a race that resolves itself): "for USMCA, stops with lat/lng = 100%,
// geofences >= stops, samsara_address_id non-null on every fence created after the fix." Track
// separately once the wizard's Samsara-address picker + a real geocode fallback land.
//
// LEAD 443.73 #3 (2026-10-11) — RULE REPLACED. Old: "bookLoad() must call autoCreateGeofencesForLoad". New: "Book Load -> the
// stop resolver draws ONE fence per stop, the location fence on the real point, and queues THAT fence to Samsara; no second
// customer-keyed fence." Why: the 443.70 acceptance run (S1) measured the old call drawing a second, customer-keyed fence for
// the same stop and pushing IT to Samsara, while the location fence detection and the read-back use was never queued. Links
// now: (1) bookLoad() runs geocodeStopsBackfill inside result.kind === "ok" for every caller; (2) bookLoad() never calls
// autoCreateGeofencesForLoad; (3) the HTTP route calls neither; (4) the resolver enqueues "samsara.create_geofence" for the
// location fence it keeps (geofence_id = that fence); (5) the handler persists samsara_address_id (unchanged).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-geofence-service-layer";
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const ROUTE = "apps/backend/src/dispatch/loads.routes.ts";
const RESOLVER = "apps/backend/src/telematics/stops-geocode-backfill.service.ts";
const HANDLER = "apps/backend/src/outbox/handlers/samsara-create-geofence.handler.ts";

function read(rel, root = ROOT) {
  return maskComments(readFileSync(join(root, rel), "utf8"));
}

export function collectProblems(root = ROOT) {
  const problems = [];
  const files = {};
  for (const [key, rel] of Object.entries({ service: SERVICE, route: ROUTE, resolver: RESOLVER, handler: HANDLER })) {
    try {
      files[key] = read(rel, root);
    } catch {
      problems.push(`missing ${rel}`);
    }
  }
  if (problems.length) return problems;
  const { service, route, resolver, handler } = files;

  // (1) every caller of bookLoad() gets the resolver, only on a successful booking.
  if (!/geocodeStopsBackfill/.test(service)) {
    problems.push(`${SERVICE}: bookLoad() must run geocodeStopsBackfill (the stop resolver that draws the ONE location fence) for every caller`);
  } else if (!/result\.kind === "ok"[\s\S]{0,1600}geocodeStopsBackfill/.test(service)) {
    problems.push(`${SERVICE}: geocodeStopsBackfill must be gated on a successful booking (result.kind === "ok")`);
  }
  // (2) no second, customer-keyed fence for the same stop.
  if (/autoCreateGeofencesForLoad/.test(service)) {
    problems.push(`${SERVICE}: bookLoad() must not call autoCreateGeofencesForLoad — it draws a second, customer-keyed fence for a stop the resolver already fences (443.73 #3)`);
  }
  // (3) the HTTP route must not fire either itself (double-fire).
  if (/autoCreateGeofencesForLoad|geocodeStopsBackfill/.test(route)) {
    problems.push(`${ROUTE}: must not call the fence writers directly — bookLoad() runs the resolver for every caller`);
  }
  // (4) the resolver queues THE location fence to Samsara, keyed to that fence.
  if (!/enqueueOutboxEvent\([\s\S]{0,40}"samsara\.create_geofence"/.test(resolver)) {
    problems.push(`${RESOLVER}: the resolver must enqueue a "samsara.create_geofence" outbox event for the location fence it keeps`);
  }
  if (!/geofence_id:\s*f\.fence_id/.test(resolver)) {
    problems.push(`${RESOLVER}: the enqueued event must carry the geofence_id of the location fence`);
  }

  // "persists the external id" — the handler for that event type must write the created
  // Samsara address id back onto geo.geofences, not just log/audit it.
  if (!/eventType\s*=\s*"samsara\.create_geofence"/.test(handler)) {
    problems.push(`${HANDLER}: must declare eventType = "samsara.create_geofence" (must match the enqueue in stops-geocode-backfill.service.ts)`);
  }
  if (!/UPDATE geo\.geofences[\s\S]{0,120}SET[\s\S]{0,120}samsara_address_id\s*=/.test(handler)) {
    problems.push(`${HANDLER}: must persist the created Samsara address id onto geo.geofences.samsara_address_id`);
  }
  if (!/samsara_address_id:\s*created\.id/.test(handler)) {
    problems.push(`${HANDLER}: must bind the persisted samsara_address_id to the id Samsara actually returned (created.id), not a placeholder`);
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
    [SERVICE]: [
      `import { geocodeStopsBackfill } from "../telematics/stops-geocode-backfill.service.js";`,
      `export async function bookLoad(input) {`,
      `  const result = await bookLoadInTransaction(input);`,
      `  if (result.kind === "ok") { void geocodeStopsBackfill(input.requestingUserUuid, input.operating_company_id, id); }`,
      `  return result;`,
      `}`,
    ].join("\n"),
    [ROUTE]: `export async function registerDispatchLoadRoutes(app) { /* no fence writer here */ }`,
    [RESOLVER]: [
      `export async function geocodeStopsWithClient(client, actorId, companyId) {`,
      `  for (const f of toPush) {`,
      `    await enqueueOutboxEvent(client as never, "samsara.create_geofence", { aggregate_type: "geo.geofences", aggregate_id: f.fence_id }, {`,
      `      operating_company_id: companyId, geofence_id: f.fence_id,`,
      `    }, key);`,
      `  }`,
      `}`,
    ].join("\n"),
    [HANDLER]: [
      `export class SamsaraCreateGeofenceHandler {`,
      `  eventType = "samsara.create_geofence";`,
      `  async deliver(payload, ctx) {`,
      `    const created = await api.createAddress({});`,
      `    await ctx.client.query(\``,
      `      UPDATE geo.geofences`,
      `      SET samsara_address_id = $3,`,
      `    \`);`,
      `    await appendCrudAudit(ctx.client, actorUserId, "x", { samsara_address_id: created.id });`,
      `  }`,
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
    {
      name: "old shape: bookLoad calls the customer-keyed auto-geofence (second fence)",
      overrides: {
        [SERVICE]: [
          `export async function bookLoad(input) {`,
          `  const result = await bookLoadInTransaction(input);`,
          `  if (result.kind === "ok") { void autoCreateGeofencesForLoad(a, b); void geocodeStopsBackfill(a, b, c); }`,
          `}`,
        ].join("\n"),
      },
      expectProblems: 1,
    },
    {
      name: "pre-Inv-40 shape (route fires, service does not)",
      overrides: {
        [SERVICE]: `export async function bookLoad(input) { return { kind: "ok", row: {} }; }`,
        [ROUTE]: `void geocodeStopsBackfill(x, y, z);`,
      },
      expectProblems: 2,
    },
    {
      name: "resolver stops queueing the location fence",
      overrides: { [RESOLVER]: `export async function geocodeStopsWithClient() { /* no enqueue */ }` },
      expectProblems: 2,
    },
    {
      name: "handler stops persisting samsara_address_id",
      overrides: {
        [HANDLER]: [
          `export class SamsaraCreateGeofenceHandler {`,
          `  eventType = "samsara.create_geofence";`,
          `  async deliver(payload, ctx) { const created = await api.createAddress({}); /* no UPDATE */ }`,
          `}`,
        ].join("\n"),
      },
      expectProblems: 2,
    },
  ];

  for (const { name, overrides, expectProblems } of cases) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "book-load-geofence-guard-"));
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
  console.log(`${LABEL} OK — bookLoad() runs the stop resolver for every caller, ONE location fence per stop is queued to Samsara, no customer-keyed second fence, and the enqueue->persist chain is wired end to end`);
}
