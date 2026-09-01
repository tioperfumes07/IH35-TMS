#!/usr/bin/env node
// verify:no-unmanifested-prod-financial-fixtures
// Owner law (docs/lockdown/NO-SEAT-PROD-FINANCIAL-FIXTURES-LAW-2026-09-01.md §6): "Ship a
// ratcheting guard that FAILs when a production financial record is created outside an
// owner-ordered walk manifest." This is the manifest-cross-reference guard the sibling
// verify-no-seat-instruction-overrides-owner-void.mjs explicitly deferred as future work (see its
// own REMAINING comment) — that guard catches an INSTRUCTION written into a memo field; this one
// catches a NAMED SEAT FIXTURE left STANDING (not voided) in prod, regardless of whether its memo
// carries an override instruction.
//
// SCOPE, deliberately narrow, same "text matching is not a control" discipline as the sibling
// guard: this does NOT flag "TEST"/"SAMPLE" as bare substrings (proven unreliable — real records
// matched "ID DOT EST", "WHITESTOWN", a genuine embezzlement-evidence Zelle this same session).
// It matches the EXACT named incident patterns from the law's own §5 examples
// (TEST-VOID-LATER, DEVIN-LIFECYCLE-TEST, TEST CODEX ONBOARD, SAMPLE Cascade-<N>) plus a narrow
// structural class: a known seat name (CC-1/CC-2/CC-3/Cascade/Codex/Devin-A/Cursor) immediately
// adjacent to TEST/SAMPLE/DEMO — the same shape as "CC3 Test Vendor Type" already found live
// elsewhere this session (docs/module-completion/vendors.md). A genuinely novel seat-fixture name
// that matches neither shape will evade this pass, same honest limitation the sibling guard
// documents for itself — narrow and buildable-today over broad and unreliable.
//
// LIVE-DATA CHECK — same as the sibling guard, requires DATABASE_URL pointed at a READ-ONLY prod
// role (.github/workflows/prod-postdeploy-verify.yml's PROD_READONLY_DATABASE_URL). SKIPs (not
// fails) without one, matching this repo's SKIP-CAPABILITY convention.
//
// RATCHET, not a hard historical gate: this repo has real, already-voided seat-fixture history
// (the OWNER-USMCA-SEAT-JUNK-PURGE-2026-09-01 this whole session referenced) that this guard was
// never meant to re-litigate. It only flags records STANDING (voided_at IS NULL) right now and not
// covered by docs/walks/AUTHORIZED-WALK-MANIFEST.json, ratcheted shrink-only against the count at
// first run — a NEW unmanifested standing fixture created after this guard ships is what fails
// the build; the historical backlog is a separate, already-tracked cleanup item (see the
// SUPPLEMENTARY board row for the 2 vendor fixtures still active).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-unmanifested-prod-financial-fixtures";
const MANIFEST_PATH = path.join(ROOT, "docs/walks/AUTHORIZED-WALK-MANIFEST.json");
const BASELINE_PATH = path.join(ROOT, "scripts/.no-unmanifested-prod-financial-fixtures-baseline.json");

const NAMED_INCIDENT_PATTERNS = [
  /\bTEST[-\s]?VOID[-\s]?LATER\b/i,
  /\bDEVIN[-\s]?LIFECYCLE[-\s]?TEST\b/i,
  /\bTEST\s+CODEX\s+ONBOARD\b/i,
  /\bSAMPLE\s+Cascade-\d+\b/i,
];

// A known seat name immediately adjacent (within a few chars) to TEST/SAMPLE/DEMO — narrower than
// a bare "contains TEST" check (which the owner already ruled unreliable): both the seat token AND
// the fixture token must be present near each other, not either alone.
const SEAT_ADJACENT_PATTERN =
  /\b(CC[-\s]?[123]|Cascade|Codex|Devin[-\s]?A?|Cursor)\b[\s\S]{0,20}\b(TEST|SAMPLE|DEMO)\b|\b(TEST|SAMPLE|DEMO)\b[\s\S]{0,20}\b(CC[-\s]?[123]|Cascade|Codex|Devin[-\s]?A?|Cursor)\b/i;

/** @param {string | null | undefined} text */
export function isKnownSeatFixturePattern(text) {
  if (!text) return null;
  for (const re of NAMED_INCIDENT_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  const m = SEAT_ADJACENT_PATTERN.exec(text);
  return m ? m[0] : null;
}

// Every column named here was confirmed live against the real schema
// (information_schema.columns, tiny-field-89581227) this session — not guessed.
const SOURCES = [
  { table: "accounting.bills", textCols: ["memo"], idCol: "id", labelCol: "bill_number", voidedCol: "voided_at" },
  { table: "accounting.expenses", textCols: ["memo"], idCol: "id", labelCol: "expense_number", voidedCol: "voided_at" },
  { table: "accounting.payments", textCols: ["notes"], idCol: "id", labelCol: "id", voidedCol: "voided_at" },
  { table: "accounting.invoices", textCols: ["customer_notes", "internal_notes"], idCol: "id", labelCol: "display_id", voidedCol: "voided_at" },
];

function loadManifestIds() {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return new Set((raw.entries ?? []).map((e) => `${e.table}:${e.id}`));
}

async function auditLive(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const manifested = loadManifestIds();
  const findings = [];
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    for (const src of SOURCES) {
      for (const col of src.textCols) {
        let exists = true;
        try {
          await client.query(`SELECT ${col} FROM ${src.table} LIMIT 0`);
        } catch {
          exists = false;
        }
        if (!exists) continue;
        const res = await client.query(
          `SELECT ${src.idCol} AS id, ${src.labelCol} AS label, ${col} AS text
           FROM ${src.table}
           WHERE ${col} IS NOT NULL AND ${src.voidedCol} IS NULL`
        );
        for (const row of res.rows) {
          const match = isKnownSeatFixturePattern(row.text);
          if (match && !manifested.has(`${src.table}:${row.id}`)) {
            findings.push({ table: src.table, column: col, id: row.id, label: row.label, match, text: row.text });
          }
        }
      }
    }
  } finally {
    await client.end();
  }
  return findings;
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).count;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`${LABEL} SKIP — no DATABASE_URL (this is a live-prod-only audit, read-only role required)`);
    return;
  }
  const findings = await auditLive(databaseUrl);
  const baseline = readBaseline();
  if (baseline === null) {
    console.error(
      `${LABEL} FAIL — no baseline file at ${path.relative(ROOT, BASELINE_PATH)}. ` +
        `Create it with {"count": ${findings.length}} to establish the shrink-only ratchet ` +
        `(current live count: ${findings.length}).`
    );
    process.exitCode = 1;
    return;
  }
  if (findings.length > 0) {
    for (const f of findings) {
      console.error(`  ✗ ${f.table}.${f.id} (${f.label}) — "${f.match}" in ${f.column}: ${f.text.slice(0, 160)}`);
    }
  }
  if (findings.length > baseline) {
    console.error(
      `${LABEL} FAIL — ${findings.length} unmanifested standing seat fixture(s) live, ` +
        `up from baseline ${baseline}. A NEW seat-created prod financial record was left standing ` +
        `outside docs/walks/AUTHORIZED-WALK-MANIFEST.json. Void it (reversing entry, WORM) or, if ` +
        `it was created during a genuine owner-ordered walk still in progress, add a manifest entry.`
    );
    process.exitCode = 1;
    return;
  }
  if (findings.length < baseline) {
    console.log(
      `${LABEL} PASS — ${findings.length} live (down from baseline ${baseline}). ` +
        `Lower scripts/.no-unmanifested-prod-financial-fixtures-baseline.json's count to ${findings.length} ` +
        `to lock in the improvement (shrink-only ratchet).`
    );
    return;
  }
  console.log(`${LABEL} PASS — ${findings.length} live == baseline ${baseline}, none unmanifested-new`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  assert.ok(isKnownSeatFixturePattern("TEST-VOID-LATER Vendor 0822") != null,
    "must catch the exact named incident: TEST-VOID-LATER");
  assert.ok(isKnownSeatFixturePattern("DEVIN-LIFECYCLE-TEST") != null,
    "must catch the exact named incident: DEVIN-LIFECYCLE-TEST");
  assert.ok(isKnownSeatFixturePattern("TEST CODEX ONBOARD 20260824") != null,
    "must catch the exact named incident: TEST CODEX ONBOARD");
  assert.ok(isKnownSeatFixturePattern("SAMPLE Cascade-2042") != null,
    "must catch the exact named incident: SAMPLE Cascade-<N>");
  assert.ok(isKnownSeatFixturePattern("CC3 Test Vendor Type") != null,
    "must catch a seat-name-adjacent-to-fixture-token shape (live example from vendors.md)");
  assert.ok(isKnownSeatFixturePattern("Cascade TEST run") != null,
    "must catch seat name before the fixture token too");

  // The exact false-positive traps the owner named must NOT be caught — same discipline as the
  // sibling instruction guard, proving this is not a bare "contains TEST" substring check.
  assert.ok(isKnownSeatFixturePattern("ID DOT EST inspection fee") == null,
    "must NOT flag a real record whose text happens to contain the substring EST");
  assert.ok(isKnownSeatFixturePattern("WHITESTOWN toll") == null,
    "must NOT flag a real record whose text happens to contain the substring TEST");
  assert.ok(isKnownSeatFixturePattern("Zelle payment, evidence in embezzlement matter") == null,
    "must NOT flag a genuine real record with no seat-fixture shape in it");
  assert.ok(isKnownSeatFixturePattern("Cummins Diesel Test Bench repair") == null,
    "must NOT flag a real vendor name containing the bare word Test with no seat name nearby");
  assert.ok(isKnownSeatFixturePattern(null) == null, "null text must not throw or match");
  assert.ok(isKnownSeatFixturePattern("") == null, "empty text must not match");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await run();
}
