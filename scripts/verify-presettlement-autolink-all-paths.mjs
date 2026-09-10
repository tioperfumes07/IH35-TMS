#!/usr/bin/env node
// REG-008 (SET-01 auto-link gap, 2026-09-09/10, owner box 09-09-2026-CC1-SET01-PRESETTLEMENT-
// AUTOLINK-GAP.md) — "The instant a load is CREATED it joins a pre-settlement... Assignment is
// automatic." book-load.service.ts links a load to a pre-settlement at booking time, but ONLY
// when a driver + trip_type are already present at that instant. The normal dispatcher workflow
// books first and assigns a driver later; every OTHER write path that sets
// mdata.loads.assigned_primary_driver_id never called the linker at all, so those loads never
// joined a pre-settlement (owner-verified live: loads 13581, 13580, 13508). Fixed in 4 files —
// the box named 3 (quick-assign.service.ts, planner.service.ts, dispatch-refinements.service.ts);
// an exhaustive grep for every `assigned_primary_driver_id = $` write site while building THIS
// guard found a 4th (assignments/quicksave.service.ts's reassignDriver, not named in the original
// box) — fixed too, per "fix it everywhere it exists, not on the screen it was found on."
//
// STATIC (always runs, no DB needed): scans every apps/backend/src/**/*.ts file (excluding
// __tests__/dist) for an `UPDATE mdata.loads ... SET ... assigned_primary_driver_id = $` write
// site. Every site found must either (a) call linkLoadToPresettlementAfterAssignmentInClientTx or
// linkLoadToPresettlementAtBookingInClientTx somewhere in the SAME file, or (b) be explicitly
// allow-listed below with a written reason. A NEW write site that does neither fails the build --
// exactly the mechanism that would have caught this gap before it shipped.
//
// LIVE (only when DATABASE_DIRECT_URL/DATABASE_URL is reachable, skipped cleanly otherwise, same
// convention as every other db-verify-*.mjs in this repo): re-runs the box's own verification
// query and asserts 0 rows for any load whose status is not still pre-driver-assignment.
import fs from "node:fs";
import path from "node:path";

const ROOT_REL = "apps/backend/src";
const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// (b) explicit allow-list -- a real write site that intentionally does not call the linker, with
// the reason written down so it can be judged, not just skipped silently.
const ALLOWLIST = {
  "apps/backend/src/onboarding/seed-sample-data.ts":
    "sample/demo data seeding only (writes is_sample_data=true in the same UPDATE) -- never a real production dispatcher assignment, out of scope for SET-01.",
};

// KNOWN LEGACY EXCEPTIONS (owner box, verified live 2026-09-10) -- the 3 loads the box itself
// named as already-orphaned BEFORE this fix landed. None can be backfilled through the real
// linker without inventing data the box explicitly says never to guess:
//   13580, 13581: trip_type is NULL (never captured) -- suggestPresettlementLink requires a real
//     TripType to resolve NB-opens-new vs TR/SB-joins-open-tour; there is no honest value to pass.
//     Box's own words: "flag if this needs an owner decision on how to infer NB/TR/SB."
//   13508: trip_type='SB' but tour_id is NULL AND the load is already `closed` (past delivery).
//     An SB leg is supposed to CLOSE an existing open tour, not open a new one -- minting a new
//     pre-settlement for an already-closed load would be inventing history, not fixing it. Box's
//     own words: "already past delivery, will never retroactively link."
// This is a named, reasoned exception list (same shape as the file ALLOWLIST above), not a faked
// pass -- it exists so the guard can still catch every FUTURE orphan (its actual job) without
// perpetually redding CI over 3 rows nobody can honestly resolve without an owner decision.
const KNOWN_LEGACY_ORPHAN_LOAD_NUMBERS = new Set(["13580", "13581", "13508"]);

const WRITE_SITE_RE = /UPDATE\s+mdata\.loads[\s\S]{0,300}?SET[\s\S]{0,300}?assigned_primary_driver_id\s*=\s*\$/;
const LINKER_CALL_RE = /linkLoadToPresettlementAfterAssignmentInClientTx\(|linkLoadToPresettlementAtBookingInClientTx\(/;

function listTsFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "__tests__" || e.name === "dist" || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listTsFiles(full, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

export function auditFile(relPath, src) {
  if (!WRITE_SITE_RE.test(src)) return null; // not a write site at all -- nothing to check
  if (LINKER_CALL_RE.test(src)) return { relPath, status: "linked" };
  if (ALLOWLIST[relPath]) return { relPath, status: "allowlisted", reason: ALLOWLIST[relPath] };
  return { relPath, status: "FAIL" };
}

export function runStatic(root = process.cwd()) {
  const files = listTsFiles(path.join(root, ROOT_REL));
  const results = [];
  for (const full of files) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    const src = fs.readFileSync(full, "utf8");
    const r = auditFile(rel, src);
    if (r) results.push(r);
  }
  return results;
}

if (process.argv.includes("--selftest")) {
  const linkedGood = `
    await client.query(\`UPDATE mdata.loads SET assigned_primary_driver_id = $2, updated_at = now() WHERE id = $1\`, []);
    await linkLoadToPresettlementAfterAssignmentInClientTx(client, {});
  `;
  const bookingGood = `
    await client.query(\`UPDATE mdata.loads SET assigned_primary_driver_id = $2 WHERE id = $1\`, []);
    await linkLoadToPresettlementAtBookingInClientTx(client, {});
  `;
  const readOnlyComparison = `
    await client.query(\`SELECT l.id FROM mdata.loads l WHERE l.assigned_primary_driver_id = $3\`, []);
  `;
  const unlinkedBad = `
    await client.query(\`UPDATE mdata.loads SET assigned_primary_driver_id = $2, updated_at = now() WHERE id = $1\`, []);
  `;

  if (auditFile("apps/backend/src/x/a.ts", linkedGood)?.status !== "linked") {
    throw new Error("SELFTEST FAIL: a real linked write site was not recognized as linked");
  }
  if (auditFile("apps/backend/src/x/b.ts", bookingGood)?.status !== "linked") {
    throw new Error("SELFTEST FAIL: the at-booking linker variant was not recognized as linked");
  }
  if (auditFile("apps/backend/src/x/c.ts", readOnlyComparison) !== null) {
    throw new Error("SELFTEST FAIL: a read-only WHERE comparison was misclassified as a write site");
  }
  if (auditFile("apps/backend/src/x/d.ts", unlinkedBad)?.status !== "FAIL") {
    throw new Error("SELFTEST FAIL: an unlinked write site went undetected");
  }
  if (auditFile("apps/backend/src/onboarding/seed-sample-data.ts", unlinkedBad)?.status !== "allowlisted") {
    throw new Error("SELFTEST FAIL: the allow-listed seed file was not recognized as allowlisted");
  }

  console.log("verify-presettlement-autolink-all-paths: SELFTEST PASS (5/5)");
  process.exit(0);
}

const results = runStatic();
const failures = results.filter((r) => r.status === "FAIL");
console.log(
  `verify-presettlement-autolink-all-paths: ${results.length} assigned_primary_driver_id write site(s) found -- ` +
    `${results.filter((r) => r.status === "linked").length} linked, ${results.filter((r) => r.status === "allowlisted").length} allow-listed, ${failures.length} unlinked`
);
for (const r of results) {
  if (r.status === "allowlisted") console.log(`  - ALLOWLISTED ${r.relPath}: ${r.reason}`);
  else console.log(`  - ${r.status === "linked" ? "OK" : "FAIL"} ${r.relPath}`);
}
if (failures.length) {
  console.error("verify-presettlement-autolink-all-paths FAILED (static): a write site never calls the SET-01 linker and is not allow-listed.");
  process.exit(1);
}
console.log("verify-presettlement-autolink-all-paths: static OK");

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.log("verify-presettlement-autolink-all-paths — SKIPPED live check (no DATABASE_DIRECT_URL/DATABASE_URL)");
  process.exit(0);
}

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const present = await client.query(
    `SELECT count(*)::int AS n FROM mdata.loads WHERE operating_company_id = $1::uuid`,
    [USMCA_OPERATING_COMPANY_ID]
  );
  if ((present.rows[0]?.n ?? 0) === 0) {
    console.log("verify-presettlement-autolink-all-paths — SKIPPED live check (USMCA mdata.loads not present in this DB)");
    client.release();
    await pool.end();
    process.exit(0);
  }

  const orphans = await client.query(
    `
      SELECT l.load_number, l.trip_type::text AS trip_type, l.status::text AS status, l.presettlement_link_id::text AS presettlement_link_id
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_primary_driver_id IS NOT NULL
        AND l.presettlement_link_id IS NULL
        AND l.soft_deleted_at IS NULL
    `,
    [USMCA_OPERATING_COMPANY_ID]
  );
  client.release();
  await pool.end();

  const unexplained = orphans.rows.filter((row) => !KNOWN_LEGACY_ORPHAN_LOAD_NUMBERS.has(String(row.load_number)));
  const explained = orphans.rows.filter((row) => KNOWN_LEGACY_ORPHAN_LOAD_NUMBERS.has(String(row.load_number)));
  for (const row of explained) {
    console.log(`  - KNOWN LEGACY EXCEPTION load ${row.load_number} (status ${row.status}, trip_type ${row.trip_type ?? "NULL"}) -- see KNOWN_LEGACY_ORPHAN_LOAD_NUMBERS comment`);
  }
  if (unexplained.length > 0) {
    console.error(`verify-presettlement-autolink-all-paths FAILED (live): ${unexplained.length} NEW driver-assigned load(s) with no pre-settlement link, not on the known-legacy list:`);
    for (const row of unexplained.rows ?? unexplained) console.error(`  - load ${row.load_number} (status ${row.status}, trip_type ${row.trip_type ?? "NULL"})`);
    process.exit(1);
  }
  console.log(`verify-presettlement-autolink-all-paths: live OK -- 0 NEW unexplained orphans (${explained.length} known legacy exception(s) unchanged)`);
} catch (err) {
  client.release();
  await pool.end();
  console.error("verify-presettlement-autolink-all-paths — ERROR:", err?.message ?? err);
  process.exit(1);
}
