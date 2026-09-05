#!/usr/bin/env node
// Inv #40 (owner order 2026-09-05, SAMSARA-CAPABILITIES-AND-INTEGRATION-PLAN-2026-09-05.md §4,
// D5, deadline 20:55Z): "Book Load -> place/geofence -> Samsara never happens. Hook only on HTTP
// route (6 of 57 loads) ... geofence + POST /addresses triggered from book-load.service (service
// layer)."
//
// This guard pins the SERVICE-LAYER half of the fix (source-scan, comments masked): every caller
// of bookLoad() -- the HTTP route, a seed script, any future service-to-service call -- now gets
// auto-geofence/Samsara-address creation, because it fires from bookLoad() itself, not only from
// the HTTP handler. Regression sentinel against the double-fire shape too (both the service AND
// the route calling it would fire it twice per HTTP-booked load).
//
// NOT covered here (needs a live Neon measurement, and depends on the Book Load wizard writing
// stop lat/lng -- a separate, frontend piece): "for USMCA, stops with lat/lng = 100%, geofences
// >= stops, samsara_address_id non-null on every fence created after the fix." Track that
// separately once the wizard's address-picker lands.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-geofence-service-layer";
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const ROUTE = "apps/backend/src/dispatch/loads.routes.ts";

function read(rel, root = ROOT) {
  return maskComments(readFileSync(join(root, rel), "utf8"));
}

export function collectProblems(root = ROOT) {
  const problems = [];
  let service;
  let route;
  try {
    service = read(SERVICE, root);
  } catch {
    problems.push(`missing ${SERVICE}`);
    return problems;
  }
  try {
    route = read(ROUTE, root);
  } catch {
    problems.push(`missing ${ROUTE}`);
    return problems;
  }

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
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "book-load-geofence-guard-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, path.dirname(SERVICE)), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, path.dirname(ROUTE)), { recursive: true });
    // Planted stub: service never calls the hook at all, route still calls it directly (the
    // exact pre-fix shape).
    fs.writeFileSync(
      path.join(tmpRoot, SERVICE),
      `export async function bookLoad(input) { return { kind: "ok", row: {} }; }`
    );
    fs.writeFileSync(
      path.join(tmpRoot, ROUTE),
      `import { autoCreateGeofencesForLoad } from "../telematics/auto-geofence.service.js";\nvoid autoCreateGeofencesForLoad(x, y);`
    );
    const planted = collectProblems(tmpRoot);
    if (planted.length !== 3) {
      console.error(`${LABEL} SELFTEST FAIL: expected 3 problems on the planted pre-fix stub, got ${planted.length}: ${JSON.stringify(planted)}`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — bookLoad() fires auto-geofence/Samsara-address creation for every caller, not only the HTTP route`);
}
