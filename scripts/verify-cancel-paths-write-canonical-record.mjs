#!/usr/bin/env node
// verify:cancel-paths-write-canonical-record
//
// OWNER DECISION 4 (2026-07-25). A load can be cancelled from TWO places and only one of them recorded it:
//
//   * POST /api/v1/dispatch/loads/:id/cancel  -> dispatch/cancellation.service.ts cancelLoad()
//       validated the reason against the canonical per-entity catalog and INSERTed a
//       dispatch.load_cancellations row carrying reason_code_id. Correct.
//   * PATCH /api/v1/mdata/loads/:id/status with new_status="cancelled"  -> mdata/loads.routes.ts
//       validated the reason, flipped mdata.loads.status, and wrote the reason ONLY into an audit-log JSON
//       string. NO dispatch.load_cancellations row, no reason_code_id — nothing for the reverse surface or
//       the cancellation reports to read. The Dispatch Kanban's "Cancelled" drop column calls this route.
//
// A status->cancelled with no cancellation record is a silent failure and an audit gap (Rule 21). The owner
// ruled it must WRITE A REAL RECORD through the same canonical flow, not be blocked.
//
// WHY THIS GUARD BANS A SECOND WRITER RATHER THAN JUST CHECKING BOTH CALL SITES: the root cause is
// duplicated logic, not a missing line. The same repo produced FIVE hand-rolled copies of the lowest-UUID
// entity resolver (LST-F05) and three copies of the catalog-registry code list (LST-CAT-07). One
// client-accepting writer, and every caller provably goes through it, is the only shape that stays true.
//
// WHAT THIS GUARD PROVES, honestly: static structure. It cannot exercise a cancel. The live proof — a cancel
// via each route producing a dispatch.load_cancellations row with reason_code_id set — is recorded in the PR
// as an authenticated check.
//
// FAILS on the pre-fix tree (loads.routes.ts writes no record) and PASSES on the fix. `--selftest` mutates
// REAL source, one case per assertion.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:cancel-paths-write-canonical-record";
const SELFTEST = process.argv.includes("--selftest");

const SERVICE = "apps/backend/src/dispatch/cancellation.service.ts";
const STATUS_ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const FILES = [SERVICE, STATUS_ROUTE];
const BACKEND_SRC = "apps/backend/src";

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const INSERT_CANCELLATION = /INSERT\s+INTO\s+dispatch\.load_cancellations\s*\(/i;

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

export function assertCancelPathsWriteCanonicalRecord(sources) {
  const get = (rel) => {
    if (sources && rel in sources) return sources[rel];
    return readDisk(rel);
  };
  const errs = [];

  const service = stripComments(get(SERVICE));
  const route = stripComments(get(STATUS_ROUTE));

  // ── 1. one exported, client-accepting writer ──────────────────────────────────────────────────────
  if (!/export async function writeLoadCancellationRecord/.test(service)) {
    errs.push(
      `${SERVICE}: must export writeLoadCancellationRecord(client, …) — the single client-accepting writer of dispatch.load_cancellations, callable from inside an already-open transaction`,
    );
  }

  // ── 2. NOBODY else may INSERT into dispatch.load_cancellations ────────────────────────────────────
  const writers = [];
  const files = new Set(walk(BACKEND_SRC));
  for (const k of Object.keys(sources ?? {})) if (k.startsWith(`${BACKEND_SRC}/`)) files.add(k);
  for (const rel of files) {
    if (/\.(test|spec)\.ts$/.test(rel) || rel.includes("__tests__")) continue;
    let code;
    try {
      code = stripComments(get(rel));
    } catch {
      continue;
    }
    if (INSERT_CANCELLATION.test(code)) writers.push(rel);
  }
  const extra = writers.filter((w) => w !== SERVICE);
  if (extra.length) {
    errs.push(
      `${extra.join(", ")}: hand-rolled INSERT INTO dispatch.load_cancellations outside ${SERVICE} — every cancel path must go through writeLoadCancellationRecord(), or the paths drift apart again (this is how PATCH /mdata/loads/:id/status ended up writing no record at all)`,
    );
  }
  if (writers.length === 0) {
    errs.push(`no file INSERTs into dispatch.load_cancellations — the canonical writer is gone`);
  }

  // ── 3. the status route's cancelled branch must call that writer ──────────────────────────────────
  if (!/writeLoadCancellationRecord\s*\(/.test(route)) {
    errs.push(
      `${STATUS_ROUTE}: the new_status="cancelled" branch does not call writeLoadCancellationRecord — it would flip mdata.loads.status with NO dispatch.load_cancellations row (owner decision 4: no silent status flip)`,
    );
  }

  // ── 4. notes are required, because cancellation_notes is NOT NULL on prod ─────────────────────────
  if (!/cancellation_notes_min_20/.test(route)) {
    errs.push(
      `${STATUS_ROUTE}: must refuse a cancel without notes (cancellation_notes_min_20) — dispatch.load_cancellations.cancellation_notes is NOT NULL with no default on prod, so a note-less cancel cannot produce a record`,
    );
  }

  // ── 5. the audit payload must carry the canonical FK, not just a memo string ──────────────────────
  const cancelledAudit = route.match(/"mdata\.loads\.cancelled"[\s\S]{0,900}?\)/);
  if (!cancelledAudit) {
    errs.push(`${STATUS_ROUTE}: could not locate the mdata.loads.cancelled audit emission`);
  } else if (!/reason_code_id/.test(cancelledAudit[0])) {
    errs.push(
      `${STATUS_ROUTE}: the mdata.loads.cancelled audit payload carries only the reason_code memo string — it must also carry reason_code_id so the audit row is traceable to the catalog entry (Rule 14: a memo is not a link)`,
    );
  }

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = assertCancelPathsWriteCanonicalRecord(mutated);
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // The exact pre-fix shape: the status route flips status and records nothing.
  expectCaught(
    "status-route-stops-writing-a-record",
    { ...live, [STATUS_ROUTE]: live[STATUS_ROUTE].replace(/writeLoadCancellationRecord/g, "noopWriter") },
    "does not call writeLoadCancellationRecord",
  );
  // A second hand-rolled writer — the duplication that caused this in the first place.
  expectCaught(
    "second-hand-rolled-insert-appears",
    {
      ...live,
      [STATUS_ROUTE]:
        live[STATUS_ROUTE] +
        '\nasync function rogue(client){ return client.query(`INSERT INTO dispatch.load_cancellations (load_id) VALUES ($1)`,[1]); }\n',
    },
    "hand-rolled INSERT INTO dispatch.load_cancellations",
  );
  expectCaught(
    "notes-requirement-removed",
    { ...live, [STATUS_ROUTE]: live[STATUS_ROUTE].replace(/cancellation_notes_min_20/g, "notes_optional") },
    "must refuse a cancel without notes",
  );
  expectCaught(
    "audit-loses-the-canonical-fk",
    { ...live, [STATUS_ROUTE]: live[STATUS_ROUTE].replace(/\n            reason_code_id: resolvedReason\?\.id \?\? null,/, "") },
    "must also carry reason_code_id",
  );
  expectCaught(
    "shared-writer-unexported",
    { ...live, [SERVICE]: live[SERVICE].replace("export async function writeLoadCancellationRecord", "async function writeLoadCancellationRecord") },
    "must export writeLoadCancellationRecord",
  );

  const liveProblems = assertCancelPathsWriteCanonicalRecord(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCancelPathsWriteCanonicalRecord();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — one client-accepting writer of dispatch.load_cancellations, both cancel paths go through it, notes are required, and the audit row carries the canonical reason FK.`,
);
