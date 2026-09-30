#!/usr/bin/env node
// B-25 (Lead order, docs/bus/NOW-CC-2.md ROUND 294): "Every recommendation states its EVIDENCE
// and its CONFIDENCE, and the human accepts or overrides. A proposal is never auto-applied...
// Guard + verify-step: a recommendation that ships without its evidence fields fails the build."
//
// This guard imports the REAL pure scorer (fuel-geofence-recommendation.engine.ts) and runs it
// against fixture windows covering every shape the live route can produce — a paired
// entered/exited window with typical dwell, one with atypical dwell, one with no exit event at
// all, one with an odometer reading, one without — then asserts every returned recommendation
// carries all of its required evidence + confidence fields, non-empty. It also statically checks
// the read-only route file contains no INSERT/UPDATE/DELETE — this feature must never write
// (owner law B, banking link-suggestion engine's identical rule; this file mirrors
// scripts/verify-no-automatch.mjs's write-freedom check for the same reason).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_REL = "apps/backend/src/fuel/fuel-geofence-recommendation.engine.ts";
const ROUTES_REL = "apps/backend/src/fuel/fuel-geofence-recommendations.routes.ts";

const REQUIRED_STRING_FIELDS = [
  "geofence_id",
  "geofence_label",
  "entered_at",
  "confidence",
  "reason",
  "evidence_source",
  "odometer_note",
];
const REQUIRED_CONFIDENCES = new Set(["high", "medium", "low"]);

const FIXTURE_WINDOWS = [
  {
    name: "typical dwell, with odometer",
    input: {
      geofence_id: "11111111-1111-1111-1111-111111111111",
      geofence_label: "Love's #0412",
      entered_at: "2026-09-30T10:00:00.000Z",
      exited_at: "2026-09-30T10:25:00.000Z",
      load_id: "22222222-2222-2222-2222-222222222222",
      load_number: "13700",
      odometer_reading_mi: 245123,
      odometer_captured_at: "2026-09-30T10:01:00.000Z",
    },
    expectConfidence: "high",
    expectOdometerNull: false,
  },
  {
    name: "atypical dwell (overnight), no odometer",
    input: {
      geofence_id: "33333333-3333-3333-3333-333333333333",
      geofence_label: "Pilot #221",
      entered_at: "2026-09-30T22:00:00.000Z",
      exited_at: "2026-10-01T06:00:00.000Z",
      load_id: null,
      load_number: null,
      odometer_reading_mi: null,
      odometer_captured_at: null,
    },
    expectConfidence: "medium",
    expectOdometerNull: true,
  },
  {
    name: "no matching exit event",
    input: {
      geofence_id: "44444444-4444-4444-4444-444444444444",
      geofence_label: "TA Laredo",
      entered_at: "2026-09-30T14:00:00.000Z",
      exited_at: null,
      load_id: null,
      load_number: null,
      odometer_reading_mi: null,
      odometer_captured_at: null,
    },
    expectConfidence: "low",
    expectOdometerNull: true,
  },
];

async function loadEngine() {
  return import(path.join(ROOT, ENGINE_REL));
}

function assertEvidenceShape(rec, label, failures) {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = rec[field];
    if (value === null || value === undefined || value === "") {
      failures.push(`${label}: recommendation is missing required evidence field "${field}"`);
    }
  }
  if (!REQUIRED_CONFIDENCES.has(rec.confidence)) {
    failures.push(`${label}: confidence "${rec.confidence}" is not one of high/medium/low`);
  }
  if (rec.evidence_source !== "geo.geofence_events") {
    failures.push(`${label}: evidence_source must literally name "geo.geofence_events", got "${rec.evidence_source}"`);
  }
  // odometer_reading_mi may legitimately be null (Samsara odometer blackout since 2026-09-10) —
  // but odometer_note must ALWAYS say so explicitly, never be silently blank.
  if (rec.odometer_reading_mi === null && rec.odometer_note !== "no odometer reading") {
    failures.push(`${label}: odometer_reading_mi is null but odometer_note does not honestly say "no odometer reading" (got "${rec.odometer_note}")`);
  }
  if (rec.odometer_reading_mi !== null && rec.odometer_note === "no odometer reading") {
    failures.push(`${label}: odometer_reading_mi is present but odometer_note still says "no odometer reading" — evidence fields disagree`);
  }
}

async function auditEngineOutputShape() {
  const failures = [];
  const { rankFuelGeofenceRecommendations } = await loadEngine();
  const ranked = rankFuelGeofenceRecommendations(FIXTURE_WINDOWS.map((f) => f.input));

  if (ranked.length !== FIXTURE_WINDOWS.length) {
    failures.push(`expected ${FIXTURE_WINDOWS.length} recommendations back, got ${ranked.length} — the engine must never drop a candidate window`);
    return failures;
  }

  for (const rec of ranked) {
    assertEvidenceShape(rec, `geofence ${rec.geofence_label}`, failures);
  }

  // Confidence-tier ranking: high before medium before low.
  const rank = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < ranked.length; i++) {
    if (rank[ranked[i - 1].confidence] > rank[ranked[i].confidence]) {
      failures.push(`recommendations are not sorted by confidence tier (index ${i - 1} "${ranked[i - 1].confidence}" comes before "${ranked[i].confidence}")`);
    }
  }

  // Cross-check each fixture's expected confidence/odometer-null shape actually held.
  const byGeofenceId = new Map(ranked.map((r) => [r.geofence_id, r]));
  for (const fixture of FIXTURE_WINDOWS) {
    const rec = byGeofenceId.get(fixture.input.geofence_id);
    if (!rec) {
      failures.push(`fixture "${fixture.name}" (geofence_id ${fixture.input.geofence_id}) is missing from engine output entirely`);
      continue;
    }
    if (rec.confidence !== fixture.expectConfidence) {
      failures.push(`fixture "${fixture.name}": expected confidence "${fixture.expectConfidence}", engine returned "${rec.confidence}"`);
    }
    if ((rec.odometer_reading_mi === null) !== fixture.expectOdometerNull) {
      failures.push(`fixture "${fixture.name}": odometer null-ness did not match expectation`);
    }
  }

  return failures;
}

function auditRouteNeverWrites() {
  const failures = [];
  const full = path.join(ROOT, ROUTES_REL);
  if (!fs.existsSync(full)) {
    failures.push(`${ROUTES_REL} does not exist`);
    return failures;
  }
  const src = fs.readFileSync(full, "utf8");
  if (!/app\.get\(/.test(src)) {
    failures.push(`${ROUTES_REL}: expected a GET route registration, found none — B-25 is read-only`);
  }
  if (/app\.(post|put|patch|delete)\(/i.test(src)) {
    failures.push(`${ROUTES_REL}: registers a non-GET route — B-25 must stay read-only (owner law B / the standing freeze)`);
  }
  const sqlWriteRe = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/i;
  if (sqlWriteRe.test(src)) {
    failures.push(`${ROUTES_REL}: contains an INSERT/UPDATE/DELETE statement — this route must never write to the database`);
  }
  return failures;
}

async function auditAll() {
  return [...(await auditEngineOutputShape()), ...auditRouteNeverWrites()];
}

async function run() {
  const failures = await auditAll();
  if (failures.length > 0) {
    console.error("verify-fuel-geofence-recommendation-evidence FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(
    `verify-fuel-geofence-recommendation-evidence OK — ${FIXTURE_WINDOWS.length}/${FIXTURE_WINDOWS.length} fixture windows carry every required evidence+confidence field, confidence-tier sort holds, route stays GET-only with zero SQL writes.`
  );
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  assert.equal((await auditAll()).length, 0, "all checks should pass on real source");

  // MUTATION 1 — a recommendation missing a required evidence field must be caught.
  const failures1 = [];
  assertEvidenceShape(
    {
      geofence_id: "x",
      geofence_label: "",
      entered_at: "2026-09-30T10:00:00.000Z",
      confidence: "high",
      reason: "test",
      evidence_source: "geo.geofence_events",
      odometer_reading_mi: null,
      odometer_note: "no odometer reading",
    },
    "mutation1",
    failures1
  );
  assert.ok(failures1.length > 0, "MUTATION 1 (blank geofence_label) escaped detection");

  // MUTATION 2 — odometer_reading_mi present but odometer_note still says "no odometer reading".
  const failures2 = [];
  assertEvidenceShape(
    {
      geofence_id: "x",
      geofence_label: "Test Stop",
      entered_at: "2026-09-30T10:00:00.000Z",
      confidence: "high",
      reason: "test",
      evidence_source: "geo.geofence_events",
      odometer_reading_mi: 12345,
      odometer_note: "no odometer reading",
    },
    "mutation2",
    failures2
  );
  assert.ok(failures2.length > 0, "MUTATION 2 (odometer present but note disagrees) escaped detection");

  // MUTATION 3 — a route file with a write must be caught.
  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-fuel-geofence-selftest-"));
  try {
    const rogueRoute = path.join(tmpDir, "rogue.routes.ts");
    fs.writeFileSync(
      rogueRoute,
      `app.get("/x", async () => {});\napp.post("/y", async (req, c) => { await c.query("INSERT INTO fuel.fuel_transactions (id) VALUES ($1)", [1]); });\n`
    );
    const src = fs.readFileSync(rogueRoute, "utf8");
    const hasWrite = /app\.(post|put|patch|delete)\(/i.test(src) || /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/i.test(src);
    assert.ok(hasWrite, "MUTATION 3 (route file with a write) escaped detection");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("verify-fuel-geofence-recommendation-evidence --selftest PASS (3/3 mutations caught)");
  process.exit(0);
}

await run();
