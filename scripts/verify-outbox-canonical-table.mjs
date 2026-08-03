#!/usr/bin/env node
/**
 * GUARD — DISP-F01: producers must enqueue onto the outbox the processor actually drains.
 *
 * THE DEFECT, MEASURED ON PROD 2026-08-03 (positive control mdata.vendors = 2,828):
 *   outbox.outbox_queue   49 rows · ALL 'PENDING' · attempts = 0 on EVERY row · oldest 2026-06-16
 *   outbox.events     31,622 rows · 31,618 delivered · 0 undelivered · last delivery minutes earlier
 * There are two outbox tables. processor.ts reads `outbox.events`; a repo-wide search finds no SELECT
 * and no UPDATE anywhere against `outbox.outbox_queue`. It is written by a dozen producers and read by
 * nobody. attempts = 0 across 6.5 weeks is the proof — not "retried and failed", never picked up once.
 *
 * WHAT WAS LOST: driver SMS, factoring packets, fuel-planner runs, load notifications, QBO bill/invoice
 * pushes and WF-064 owner-override notices. Each producer's call returns successfully, so every one of
 * these looked healthy at the call site while nothing downstream ever ran.
 *
 * WHAT THIS ENFORCES, IN TWO PARTS:
 *  1. The WF-064 override notice — the one orphaned event whose handler exists and is registered
 *     (handlers/registry.ts) — must never again be written to the dead table. This is the regression
 *     guard for the fix.
 *  2. The set of files still writing to outbox.outbox_queue may only SHRINK. New code cannot join the
 *     orphaned table, and each remaining producer's repoint removes its line here. A fixed count would
 *     go stale; an allowlist that can only shrink is a ratchet.
 *
 * WHY THE OTHER SEVEN EVENT TYPES ARE NOT SIMPLY REPOINTED: they have NO registered handler. Moving
 * them would turn a silent no-op into a failure loop without delivering anything. They need handlers
 * built first; that is tracked work, deliberately not laundered through this guard.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:outbox-canonical-table";
const SRC = "apps/backend/src";
const ORPHAN_TABLE = "outbox.outbox_queue";
const OVERRIDE_EVENT = "dispatch.wf064.override_notice";

/**
 * Files still permitted to write the orphaned table. SHRINK-ONLY: removing a producer deletes its
 * entry; adding one is a build failure. Recorded 2026-08-03 from the live tree.
 */
const KNOWN_ORPHAN_WRITERS = [
  "apps/backend/src/banking/manual-je.routes.deprecated.ts",
  "apps/backend/src/dispatch/book-load.service.ts",
  "apps/backend/src/dispatch/dispatch-refinements.service.ts",
  "apps/backend/src/dispatch/intransit-issues.routes.ts",
  "apps/backend/src/dispatch/load-distribution.service.ts",
  "apps/backend/src/factoring/packet-assemble.service.ts",
  "apps/backend/src/fuel/planner.routes.ts",
  "apps/backend/src/liabilities/liabilities.routes.ts",
  "apps/backend/src/maintenance/triage.routes.ts",
  "apps/backend/src/maintenance/work-orders.routes.ts",
  "apps/backend/src/outbox/handlers/dispatch-load-dispatched.handler.ts",
];

export function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** True when the file writes the orphaned table (comments stripped, so prose never counts). */
export function writesOrphanTable(src) {
  return new RegExp(`INSERT\\s+INTO\\s+${ORPHAN_TABLE.replace(".", "\\.")}`, "i").test(stripComments(src));
}

/**
 * True when the file enqueues the WF-064 override notice onto the ORPHAN table specifically. Matched
 * within a bounded window so an unrelated orphan INSERT elsewhere in a big file is not blamed.
 */
export function writesOverrideNoticeToOrphan(src) {
  const body = stripComments(src);
  const re = new RegExp(
    `INSERT\\s+INTO\\s+${ORPHAN_TABLE.replace(".", "\\.")}[\\s\\S]{0,600}?${OVERRIDE_EVENT.replace(/\./g, "\\.")}`,
    "i"
  );
  return re.test(body);
}

export function analyse(files) {
  const problems = [];
  const allowed = new Set(KNOWN_ORPHAN_WRITERS);
  const writersFound = [];

  for (const [file, raw] of Object.entries(files)) {
    if (raw == null) continue;

    if (writesOverrideNoticeToOrphan(raw)) {
      problems.push(
        `${file}: enqueues ${OVERRIDE_EVENT} onto ${ORPHAN_TABLE}, which no code reads. The handler is ` +
          `registered and the processor is healthy, but it drains outbox.events — an owner override of ` +
          `an OOS unit, an HOS violation or a federal driver-qualification stop would be announced to ` +
          `nobody. Use enqueueOverrideNotice() (apps/backend/src/outbox/enqueue-override-notice.ts).`
      );
    }

    if (writesOrphanTable(raw)) {
      writersFound.push(file);
      if (!allowed.has(file)) {
        problems.push(
          `${file}: NEW writer of ${ORPHAN_TABLE}. That table is drained by nothing (prod: 49 rows, ` +
            `attempts=0, oldest 2026-06-16). Enqueue onto outbox.events instead, and make sure the ` +
            `event_type has a registered handler — otherwise it will fail loudly rather than silently.`
        );
      }
    }
  }

  // Ratchet: a repointed producer must be struck from the allowlist so the list keeps shrinking.
  const found = new Set(writersFound);
  for (const stale of KNOWN_ORPHAN_WRITERS) {
    if (!found.has(stale)) {
      problems.push(
        `${stale} no longer writes ${ORPHAN_TABLE} — remove it from KNOWN_ORPHAN_WRITERS in ` +
          `scripts/verify-outbox-canonical-table.mjs (the allowlist must only shrink).`
      );
    }
  }

  return problems;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules" && entry !== "__tests__") walk(full, out);
    } else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function readAll() {
  const files = {};
  for (const f of walk(SRC)) files[f] = readFileSync(f, "utf8");
  return files;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => { if (!cond) failures.push(label); };

  // Every allowlisted file must be present for the ratchet arm not to fire spuriously in selftest.
  const base = {};
  for (const f of KNOWN_ORPHAN_WRITERS) base[f] = `INSERT INTO ${ORPHAN_TABLE} (event_type) VALUES ($1)`;

  t("the recorded allowlist alone passes", analyse({ ...base }).length === 0);

  // THE REAL PRE-FIX STATE.
  const preFix = {
    ...base,
    "apps/backend/src/dispatch/book-load.service.ts":
      `INSERT INTO ${ORPHAN_TABLE} (aggregate_type, aggregate_id, event_type, payload)\nVALUES ($1,$2,$3,$4::jsonb)\n"${OVERRIDE_EVENT}",`,
  };
  t("the override notice on the orphan table FAILS", analyse(preFix).length === 1);

  t("a NEW orphan writer FAILS",
    analyse({ ...base, "apps/backend/src/new/thing.ts": `INSERT INTO ${ORPHAN_TABLE} (x) VALUES (1)` }).length === 1);

  t("writing outbox.events is fine",
    analyse({ ...base, "apps/backend/src/new/thing.ts": "INSERT INTO outbox.events (event_type) VALUES ($1)" }).length === 0);

  t("a comment mentioning the orphan table does not count",
    analyse({ ...base, "apps/backend/src/new/thing.ts": `// INSERT INTO ${ORPHAN_TABLE} was the old way` }).length === 0);

  t("a repointed producer must leave the allowlist (ratchet)",
    analyse(Object.fromEntries(Object.entries(base).slice(1))).length === 1);

  t("the override event on outbox.events passes",
    analyse({ ...base, "apps/backend/src/x.ts": `INSERT INTO outbox.events (event_type) VALUES ("${OVERRIDE_EVENT}")` }).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (3 pass-shapes, 4 fail-shapes incl. the real orphaned-override state)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — the WF-064 override notice enqueues on outbox.events; ` +
    `${KNOWN_ORPHAN_WRITERS.length} legacy orphan writer(s) remain (shrink-only)`
);
