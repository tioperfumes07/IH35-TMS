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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-geofence-service-layer";
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const ROUTE = "apps/backend/src/dispatch/loads.routes.ts";
const AUTO_GEOFENCE = "apps/backend/src/telematics/auto-geofence.service.ts";
const HANDLER = "apps/backend/src/outbox/handlers/samsara-create-geofence.handler.ts";

function read(rel, root = ROOT) {
  return maskComments(readFileSync(join(root, rel), "utf8"));
}

export function collectProblems(root = ROOT) {
  const problems = [];
  const files = {};
  for (const [key, rel] of Object.entries({ service: SERVICE, route: ROUTE, autoGeofence: AUTO_GEOFENCE, handler: HANDLER })) {
    try {
      files[key] = read(rel, root);
    } catch {
      problems.push(`missing ${rel}`);
    }
  }
  if (problems.length) return problems;
  const { service, route, autoGeofence, handler } = files;

  if (!/from ["']\.\.\/telematics\/auto-geofence\.service\.js["']/.test(service) || !/autoCreateGeofencesForLoad/.test(service)) {
    problems.push(`${SERVICE}: bookLoad() must call autoCreateGeofencesForLoad itself — every caller needs this, not only the HTTP route`);
  }
  // Must fire only on success (kind === "ok"), never unconditionally (a failed booking has no
  // load to geofence) and never inside the booking transaction itself (a Samsara/geocoding
  // failure must never roll back or delay the load booking response).
  if (!/result\.kind === "ok"[\s\S]{0,300}autoCreateGeofencesForLoad/.test(service)) {
    problems.push(`${SERVICE}: autoCreateGeofencesForLoad must be gated on a successful booking (result.kind === "ok")`);
  }

  // Regression sentinel: the HTTP route must not ALSO call it — that would double-fire for every
  // HTTP-booked load now that bookLoad() itself does it.
  if (/autoCreateGeofencesForLoad/.test(route)) {
    problems.push(`${ROUTE}: must not call autoCreateGeofencesForLoad directly anymore — it moved into bookLoad() (book-load.service.ts); calling it here too double-fires it`);
  }

  // "invokes the geofence create" — the standalone helper must enqueue the outbox event that
  // actually talks to Samsara, keyed to the geofence row it just inserted.
  if (!/enqueueOutboxEvent\(\s*client,\s*\n?\s*"samsara\.create_geofence"/.test(autoGeofence)) {
    problems.push(`${AUTO_GEOFENCE}: autoCreateGeofencesForLoadWithClient must enqueue a "samsara.create_geofence" outbox event per new geofence`);
  }
  if (!/geofence_id:\s*geofenceId/.test(autoGeofence)) {
    problems.push(`${AUTO_GEOFENCE}: the enqueued event must carry the geofence_id it was created for`);
  }

  // "persists the external id" — the handler for that event type must write the created
  // Samsara address id back onto geo.geofences, not just log/audit it.
  if (!/eventType\s*=\s*"samsara\.create_geofence"/.test(handler)) {
    problems.push(`${HANDLER}: must declare eventType = "samsara.create_geofence" (must match the enqueue in auto-geofence.service.ts)`);
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
      `import { autoCreateGeofencesForLoad } from "../telematics/auto-geofence.service.js";`,
      `export async function bookLoad(input) {`,
      `  const result = await bookLoadInTransaction(input);`,
      `  if (result.kind === "ok") { void autoCreateGeofencesForLoad(input.requestingUserUuid, {}); }`,
      `  return result;`,
      `}`,
    ].join("\n"),
    [ROUTE]: `export async function registerDispatchLoadRoutes(app) { /* no geofence call here */ }`,
    [AUTO_GEOFENCE]: [
      `export async function autoCreateGeofencesForLoadWithClient(client, actorUserId, input) {`,
      `  await enqueueOutboxEvent(`,
      `    client,`,
      `    "samsara.create_geofence",`,
      `    { aggregate_type: "geo.geofences", aggregate_id: geofenceId },`,
      `    { geofence_id: geofenceId },`,
      `  );`,
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
      name: "pre-fix shape (route calls it directly, service doesn't)",
      overrides: {
        [SERVICE]: `export async function bookLoad(input) { return { kind: "ok", row: {} }; }`,
        [ROUTE]: `import { autoCreateGeofencesForLoad } from "../telematics/auto-geofence.service.js";\nvoid autoCreateGeofencesForLoad(x, y);`,
      },
      expectProblems: 3,
    },
    {
      name: "auto-geofence stops enqueuing the outbox event",
      overrides: { [AUTO_GEOFENCE]: `export async function autoCreateGeofencesForLoadWithClient() { /* no enqueue */ }` },
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
  console.log(`${LABEL} OK — bookLoad() fires auto-geofence/Samsara-address creation for every caller, and the create->enqueue->persist chain is wired end to end`);
}
