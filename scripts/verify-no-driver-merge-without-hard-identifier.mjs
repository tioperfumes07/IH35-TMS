#!/usr/bin/env node
// Q16 (docs/bus/00-WORK-QUEUE.md, P1 GUARD, owner-set per docs/bus/00-SEQUENCE.md) — no two
// mdata.drivers rows may ever be linked/consolidated as "the same person" on name similarity
// alone. Task 32 (Genaro Guerrero Chavez, two live driver rows) needs a real per-table merge;
// Task 33 (Morales / Carlos Mauricio trio) stays deliberately UNMERGED because name similarity
// is not proof of identity — Devin-B verifying the duplicates are still present was CORRECT, not
// a defect. This guard locks that discipline into the gate so neither mistake can silently ship.
//
// THE ONLY existing mechanism in this codebase that links two mdata.drivers rows as one physical
// person's history is the rehire chain: `mdata.drivers.prior_driver_id`, a self-referential FK
// set once, at driver creation, by apps/backend/src/mdata/drivers.routes.ts's rehire-override
// path. That path already requires a HARD IDENTIFIER match (CURP, or CDL number + CDL state,
// via the pure function driverIdentityMatches -- never first/last name) before it will link, and
// fails closed with `prior_driver_identity_mismatch` otherwise (confirmed by reading the file in
// full, 2026-09-24). This guard exists to keep it that way and to catch a second, bypassing path
// before it ships:
//
//   STATIC  1. drivers.routes.ts's rehire-link code path still calls a curp/cdl_number identity
//              check (by name, driverIdentityMatches) before it may write prior_driver_id, and
//              the function itself still requires curp OR (cdl_number AND cdl_state) to match
//              exactly -- never first_name/last_name/a fuzzy score.
//           2. prior_driver_id is written from EXACTLY ONE file in the whole repo
//              (apps/backend/src/mdata/drivers.routes.ts) -- a second writer is a bypass of the
//              identity check by construction, whatever its own internal logic claims to do.
//           3. no OTHER function/route anywhere in apps/backend/src or scripts/ names itself
//              merge/consolidate/dedupe + driver (a plausible future "just merge these two rows"
//              utility) without itself referencing a hard-identifier column (curp/cdl_number/
//              passport_number/ine_number/mexican_license_number) in its own source.
//   LIVE    4. every live mdata.drivers row that DOES carry a prior_driver_id satisfies the same
//              hard-identifier match against the row it points to (curp equal, or cdl_number+
//              cdl_state equal) -- the code-level guarantee, re-checked against real rows, not
//              just trusted from reading the source. Vacuously true over zero linked rows (0 today
//              -- Task 32/33 have not been merged yet, correctly).
//
// Fails closed with no DATABASE_URL (requireLiveDbOrExit, ROUND 29.9-B).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB =
  "live-data guard; the hard-identifier invariant on live prior_driver_id links is re-checked against real rows, fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

const LABEL = "verify-no-driver-merge-without-hard-identifier";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVERS_ROUTES_PATH = "apps/backend/src/mdata/drivers.routes.ts";
const HARD_IDENTIFIER_COLUMNS = ["curp", "cdl_number", "passport_number", "ine_number", "mexican_license_number"];

/**
 * Pure: the physical-identity check a rehire-link (or any future driver-merge path) must pass.
 * Mirrors drivers.routes.ts's own driverIdentityMatches exactly -- curp exact match, or
 * cdl_number+cdl_state exact match, both case/whitespace-normalized. Never name-based.
 * @returns {"curp" | "cdl" | null}
 */
export function driverIdentityMatches(a, b) {
  const norm = (v) => (v ?? "").trim().toUpperCase();
  const aCurp = norm(a.curp);
  const bCurp = norm(b.curp);
  if (aCurp && bCurp && aCurp === bCurp) return "curp";
  const aCdlN = norm(a.cdl_number), aCdlS = norm(a.cdl_state);
  const bCdlN = norm(b.cdl_number), bCdlS = norm(b.cdl_state);
  if (aCdlN && aCdlS && bCdlN && bCdlS && aCdlN === bCdlN && aCdlS === bCdlS) return "cdl";
  return null;
}

/**
 * Pure: given a set of repo files' relative paths (that actually write prior_driver_id somewhere
 * in their source, per a caller-supplied grep), which are illegitimate writers?
 */
export function detectUnauthorizedPriorDriverWriters(writerFiles) {
  return writerFiles.filter((f) => f !== DRIVERS_ROUTES_PATH);
}

/**
 * Pure: given candidate {file, source} entries whose filename/identifier suggests a driver-merge
 * utility, which ones never reference any hard-identifier column in their own source (the
 * suspicious case -- a merge that could only be keyed on name/fuzzy match)?
 */
export function detectMergeUtilitiesWithoutHardIdentifier(candidates) {
  return candidates.filter((c) => !HARD_IDENTIFIER_COLUMNS.some((col) => c.source.includes(col)));
}

function readRepoFile(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|mjs)$/.test(entry.name) && !/__tests__|\.test\.ts$|\.db\.test\.ts$/.test(full)) out.push(full);
  }
  return out;
}

function staticChecks() {
  const failures = [];

  const routesSrc = readRepoFile(DRIVERS_ROUTES_PATH);
  if (!routesSrc) {
    failures.push(`${DRIVERS_ROUTES_PATH} is missing -- the only known driver-identity-link path is gone`);
    return failures;
  }
  if (!/driverIdentityMatches\s*\(/.test(routesSrc)) {
    failures.push(`${DRIVERS_ROUTES_PATH} no longer calls driverIdentityMatches before linking prior_driver_id`);
  }
  if (!/prior_driver_identity_mismatch/.test(routesSrc)) {
    failures.push(`${DRIVERS_ROUTES_PATH} no longer fails closed with prior_driver_identity_mismatch on a non-match`);
  }
  const fnMatch = routesSrc.match(/function driverIdentityMatches\(([\s\S]*?)\n\}/);
  if (!fnMatch) {
    failures.push(`${DRIVERS_ROUTES_PATH}: driverIdentityMatches function body not found to inspect`);
  } else {
    const body = fnMatch[1];
    if (!/curp/i.test(body) || !(/cdl_number/i.test(body) && /cdl_state/i.test(body))) {
      failures.push("driverIdentityMatches no longer checks curp or cdl_number+cdl_state -- may have been weakened to a name-based check");
    }
    if (/first_name|last_name/i.test(body)) {
      failures.push("driverIdentityMatches references first_name/last_name -- a hard-identifier check must never fall back to name matching");
    }
  }

  // Only a raw SQL write against the real table counts as "writing" prior_driver_id -- an HTTP
  // integration test that sends {prior_driver_id: ...} as a JSON request body (exercising the
  // guarded route through its own front door, never touching SQL directly) must never be flagged
  // as a second writer just because the string appears in its test fixtures.
  const SQL_WRITE_RE = /(INSERT INTO\s+mdata\.drivers\s*\([\s\S]{0,2000}?prior_driver_id|UPDATE\s+mdata\.drivers\b[\s\S]{0,500}?\bSET\b[\s\S]{0,500}?prior_driver_id\s*=)/;

  const allFiles = [...walk(path.join(ROOT, "apps/backend/src")), ...walk(path.join(ROOT, "scripts"))];
  const priorDriverWriters = [];
  const mergeUtilityCandidates = [];
  for (const full of allFiles) {
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    const src = fs.readFileSync(full, "utf8");
    if (SQL_WRITE_RE.test(src)) priorDriverWriters.push(rel);
    // A merge-UTILITY candidate must (a) be named like one, (b) actually touch mdata.drivers or a
    // driver_id-shaped column (excludes unrelated tools like git-merge-driver.mjs, a git-attributes
    // merge driver for JSON registries -- "driver" there is git's own vocabulary, not personnel),
    // and (c) not be a read-only guard (scripts/verify-*.mjs) -- a guard checking the AFTERMATH of
    // a merge (e.g. orphaned references) is not itself a merge implementation and is not expected
    // to perform an identity check of its own.
    const isGuardFile = /^scripts\/verify-/.test(rel);
    const touchesDriversTable = /mdata\.drivers\b/.test(src) || /\bdriver_id\b/.test(src) || /\bdriver_uuid\b/.test(src);
    if (!isGuardFile && touchesDriversTable && /\bdriver\b/i.test(rel) && /(merge|consolidate|dedupe|dedup)/i.test(rel)) {
      mergeUtilityCandidates.push({ file: rel, source: src });
    }
  }

  const unauthorized = detectUnauthorizedPriorDriverWriters([...new Set(priorDriverWriters)]);
  for (const f of unauthorized) failures.push(`${f} writes prior_driver_id but is not the one authorised identity-checked path (${DRIVERS_ROUTES_PATH})`);

  const noHardId = detectMergeUtilitiesWithoutHardIdentifier(mergeUtilityCandidates);
  for (const c of noHardId) failures.push(`${c.file}: named like a driver-merge utility but references no hard-identifier column (${HARD_IDENTIFIER_COLUMNS.join("/")})`);

  return failures;
}

async function liveCheck() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await client.query(
      `SELECT d.id::text AS id, d.curp, d.cdl_number, d.cdl_state,
              p.id::text AS prior_id, p.curp AS prior_curp, p.cdl_number AS prior_cdl_number, p.cdl_state AS prior_cdl_state
         FROM mdata.drivers d
         JOIN mdata.drivers p ON p.id = d.prior_driver_id
        WHERE d.operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    await client.query("COMMIT");
    const violations = [];
    for (const r of res.rows) {
      const matched = driverIdentityMatches(
        { curp: r.curp, cdl_number: r.cdl_number, cdl_state: r.cdl_state },
        { curp: r.prior_curp, cdl_number: r.prior_cdl_number, cdl_state: r.prior_cdl_state }
      );
      if (!matched) violations.push(`${r.id} -> prior ${r.prior_id}: neither curp nor cdl_number+cdl_state match`);
    }
    return { count: res.rows.length, violations };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  assert.ok(driverIdentityMatches({ curp: "ABCD123456HDFRRL01" }, { curp: "abcd123456hdfrrl01" }) === "curp", "curp must match case-insensitively");
  assert.ok(driverIdentityMatches({ cdl_number: "T1234567", cdl_state: "TX" }, { cdl_number: "t1234567", cdl_state: "tx" }) === "cdl", "cdl_number+state must match case-insensitively");
  assert.ok(driverIdentityMatches({ curp: "AAA" }, { curp: "BBB" }) === null, "different curp must not match");
  assert.ok(driverIdentityMatches({ cdl_number: "T1", cdl_state: "TX" }, { cdl_number: "T1", cdl_state: "CA" }) === null, "same cdl_number, different state must NOT match -- state disambiguates the number");
  assert.ok(driverIdentityMatches({}, {}) === null, "two empty identity sets must never match");
  assert.ok(driverIdentityMatches({ curp: null }, { curp: null }) === null, "null curp on both sides must never match");

  assert.ok(
    detectUnauthorizedPriorDriverWriters(["apps/backend/src/mdata/drivers.routes.ts"]).length === 0,
    "the one authorised writer must never itself be flagged"
  );
  const bypass = detectUnauthorizedPriorDriverWriters(["apps/backend/src/mdata/drivers.routes.ts", "scripts/ops/sneaky-driver-merge.mjs"]);
  assert.ok(bypass.length === 1 && bypass[0] === "scripts/ops/sneaky-driver-merge.mjs", "a second writer must be flagged as unauthorised");

  const clean = detectMergeUtilitiesWithoutHardIdentifier([
    { file: "scripts/ops/merge-duplicate-driver.mjs", source: "if (a.curp === b.curp) { /* merge */ }" },
  ]);
  assert.ok(clean.length === 0, "a merge utility that references curp must not be flagged");
  const dirty = detectMergeUtilitiesWithoutHardIdentifier([
    { file: "scripts/ops/merge-duplicate-driver.mjs", source: "if (a.first_name === b.first_name) { /* merge */ }" },
  ]);
  assert.ok(dirty.length === 1, "a merge utility with no hard-identifier reference at all must be flagged");

  console.log(`${LABEL} --selftest PASS`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const staticFailures = staticChecks();
  const { count, violations } = await liveCheck();
  const failures = [...staticFailures, ...violations];
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL — ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — the one authorised prior_driver_id writer still requires a curp/cdl_number+state hard-identifier match (never name), no other writer exists, no unguarded merge utility found; ${count} live linked driver row(s) checked, all satisfy the invariant.`);
}

await main();
