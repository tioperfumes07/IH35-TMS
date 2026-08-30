#!/usr/bin/env node
// verify-no-jsonb-id-array-as-fk.mjs — SAF-DOM-02 / class sweep C13.
//
// THE DEFECT CLASS. A jsonb column holding an array of entity ids ("related_drivers":
// ["<uuid>", ...]) is a MEMO, not a link. The database will not check it, will not cascade it, will
// not stop the referenced row from disappearing, and cannot be queried in reverse. Every serious
// system this product is measured against — QuickBooks, NetSuite, McLeod, Alvys — models a
// many-to-many with a junction row carrying two foreign keys, because the point of a relational
// database is that it REFUSES invalid states. A jsonb id array opts out of that entirely.
//
// It is not theoretical. safety.company_violations shipped related_drivers / related_units /
// related_fine_ids as jsonb (0050). 202607820000 added the three FK join tables and repointed the
// LIST read and the CREATE write — but nothing stopped the retired columns from being written, so:
//   • PATCH kept writing the jsonb the read path had abandoned → an operator's edit silently
//     no-ops (SAF-B28), and
//   • safety.auto_create_internal_fine_from_violation() (SECURITY DEFINER, fired on resolve) kept
//     resolving its driver from the jsonb the create path had stopped filling → a monetary_fine
//     resolution silently issues NO FINE.
// Half a normalization is worse than none: two half-truths that disagree, with no error anywhere.
//
// WHAT THIS GUARD ENFORCES (pure static analysis of db/migrations + apps/ + the committed prod
// schema mirror docs/schema-parity-baseline.json — no DB connection, safe in CI and offline):
//
//   ARM 1 — INVENTORY. Every jsonb column in db/migrations whose NAME declares it holds entity
//           references (related_* / linked_* / associated_* / assigned_* / affected_* / involved_* /
//           selected_*, or a name ending _id/_ids/_uuid/_uuids) is a C13 instance and must be
//           resolved one of three ways, or the build fails:
//             (a) ARCHIVED — proven, not asserted. Requires ALL THREE of: a successor table that
//                 really exists in the prod schema mirror; a deprecating COMMENT ON COLUMN naming
//                 that successor; and DB-ENFORCED stop-write (a BEFORE UPDATE OF <col> trigger on
//                 the table). A COMMENT alone is NOT archived — that is precisely the state that
//                 produced SAF-DOM-02, and this guard refuses to accept it again.
//             (b) METADATA — allowlisted as genuine non-referential metadata, with a substantive
//                 stated reason.
//             (c) OPEN — a known, tracked, unfixed instance carrying the id of the block that owns
//                 it. A RATCHET: the list may only shrink.
//
//   ARM 2 — NO WRITER LEFT BEHIND. Once a column is ARCHIVED, application source may not still
//           name it, except via a ratcheted exception naming the owning block. This is the arm that
//           would have caught SAF-B28 the day 202607820000 landed.
//
//   ARM 3 — THE LISTS CANNOT ROT. Every entry in every list must still match something real: a
//           stale OPEN entry (column gone), a stale exception (mention gone), a reasonless entry, a
//           blockless entry, or a list grown past its ceiling all FAIL. An exemption that outlives
//           its defect is a permanent hole, so the guard makes cleanup mandatory rather than polite.
//
// DELIBERATE, STATED LIMITS — this guard does not pretend to cover the whole class:
//   • uuid[] ARRAY columns carrying the same defect (safety.company_violations.evidence_doc_ids,
//     safety.internal_fines / settlement_disputes evidence_doc_ids, …) are NOT covered. Same
//     disease, different type; a separate sweep, not a silent omission.
//   • jsonb whose NAME does not declare entity references but whose CONTENT does
//     (catalogs.form_425c_company_profiles.bank_accounts, safety.dot_inspections.cited_violations /
//     violations_jsonb) is NOT covered. A name-based classifier cannot prove content, and guessing
//     is worse than a named gap.
//   • This is static. It proves the trigger is DECLARED in a migration, not that it is INSTALLED on
//     prod — held migrations are applied by the owner's hand. Live proof is the owner's apply step.
//
// PRE-FIX / POST-FIX: run against pre-fix origin/main this FAILS with 3 problems (the three
// company_violations columns are COMMENT-archived but have no stop-write enforcement, so they are
// neither archived nor tracked). On the SAF-DOM-02 branch it PASSES.
//
// --selftest runs FIRST, plants a defect against every assertion in an in-memory copy of the REAL
// sources, and asserts each one is caught (and that the mutation was not inert), plus classifier
// controls proving the corrected shapes are NOT flagged.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-jsonb-id-array-as-fk";
const SELFTEST = process.argv.includes("--selftest");

const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const PARITY_BASELINE = path.join(ROOT, "docs", "schema-parity-baseline.json");
const CODE_DIRS = [path.join(ROOT, "apps", "backend", "src"), path.join(ROOT, "apps", "frontend", "src")];

// ── The three lists. Each is a RATCHET with a ceiling: it may shrink, never grow. ────────────────

// (b) Genuine non-referential metadata that trips the name classifier. Empty today — kept as a real
// mechanism (exercised by --selftest) because the first true metadata case must have somewhere to
// go other than "weaken the classifier".
export const METADATA_ALLOWLIST = [
  // { table: "schema.table", column: "col", reason: "why this jsonb is genuinely not a link (>= 40 chars)" }
];
const METADATA_CEILING = 3;

// (c) Known-open C13 instances. Each carries the block that owns the fix. NONE of these is
// safety.company_violations — those are SAF-DOM-02's own subject and must be proven ARCHIVED, not
// parked here.
export const OPEN_INSTANCES = [
  {
    table: "safety.integrity_alerts",
    column: "related_load_ids",
    block: "SAF-C13-01",
    reason:
      "Integrity alert → loads. Real C13 instance: should be safety.integrity_alert_loads(alert_id, load_id) FK'd to mdata.loads. Not in SAF-DOM-02's scope (different table, different owner surface); tracked so it cannot be forgotten.",
  },
  {
    table: "safety.integrity_alerts",
    column: "related_wo_ids",
    block: "SAF-C13-01",
    reason:
      "Integrity alert → work orders. Must FK maintenance.work_orders (canonical — NOT maint.*). Same table as related_load_ids so the two normalize together in one migration.",
  },
  {
    table: "safety.integrity_alerts",
    column: "related_safety_event_ids",
    block: "SAF-C13-01",
    reason:
      "Integrity alert → safety events. Third jsonb id array on the same row; normalizes with the other two rather than in a third migration.",
  },
  {
    table: "safety.drug_pool_selections",
    column: "selected_driver_ids",
    block: "SAF-C13-02",
    reason:
      "The DOT random-testing pool draw. Regulator-facing evidence (49 CFR 382.305) whose driver ids are today unenforced, so a selected driver can be deleted out of an audit record. Needs its own block because the draw is a point-in-time snapshot and the junction must preserve draw order and seed.",
  },
];
const OPEN_CEILING = 4;

// ARM 2 exceptions. An ARCHIVED column still named in application source.
export const CODE_REFERENCE_EXCEPTIONS = [
  {
    file: "apps/backend/src/safety/company-violations.routes.ts",
    columns: ["related_drivers", "related_units", "related_fine_ids"],
    block: "SAF-B28",
    reason:
      "The PATCH handler (:256-269) still writes the three retired jsonb columns and never touches the join tables, so an operator's edit silently no-ops against a read path that uses the junctions. Tracked in the C2 lane; SAF-DOM-02 deliberately does not reach across lanes to edit this file. DELETE THIS ENTRY in the SAF-B28 fix PR — the guard FAILS on a stale exception, which is how the cleanup gets forced.",
  },
  {
    file: "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx",
    columns: ["related_drivers", "related_units"],
    block: "SAF-DOM-02",
    reason:
      "found stale 2026-08-29: verified this file only NAMES the strings as CREATE-mutation payload keys (related_drivers: [id] / related_units: [id]), and the CREATE route (company-violations.routes.ts:346-417, same lane) never writes them to the retired jsonb -- it consumes body.data.related_drivers/related_units solely to INSERT rows into the real join tables (company_violation_drivers/company_violation_units). No jsonb column is touched by this file, directly or indirectly; the guard's name-based classifier cannot distinguish a same-named payload field from an actual column write, so this is a documented false positive, not an unfixed writer.",
  },
];
const CODE_EXCEPTION_CEILING = 3;

// ── Classifier ───────────────────────────────────────────────────────────────────────────────────
// Narrow ON PURPOSE. It fires only on names that DECLARE the column holds entity references, so it
// has no false positives to suppress and no judgement calls to launder through an allowlist.
const ENTITY_LINK_NAME =
  /^(?:related|linked|associated|assigned|affected|involved|selected|referenced)_[a-z0-9_]+$|_(?:ids|uuids|id|uuid)$/;

// Names that end in _id/_ids but are transport envelopes, not references.
const NOT_A_REFERENCE = /^(?:payload|raw_payload|metadata|meta)$/;

/** Strip dollar-quoted bodies ($$ … $$, $tag$ … $tag$) so plpgsql DECLAREs are never read as columns. */
export function stripDollarQuoted(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const open = /\$[a-zA-Z0-9_]*\$/g;
    open.lastIndex = i;
    const m = open.exec(sql);
    if (!m) {
      out += sql.slice(i);
      break;
    }
    out += sql.slice(i, m.index);
    const tag = m[0];
    const close = sql.indexOf(tag, m.index + tag.length);
    if (close === -1) {
      // Unterminated — treat the remainder as body and drop it rather than mis-parse it.
      break;
    }
    out += " /*body*/ ";
    i = close + tag.length;
  }
  return out;
}

/** Collect jsonb columns declared in CREATE TABLE / ALTER TABLE ADD COLUMN across all migrations. */
export function collectJsonbColumns(migrationSources) {
  const found = new Map(); // "schema.table.col" -> { table, column, file }
  for (const [file, raw] of Object.entries(migrationSources)) {
    const sql = stripDollarQuoted(raw);
    let currentTable = null;
    for (const line of sql.split(/\r?\n/)) {
      const bare = line.replace(/--.*$/, "");
      const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/i.exec(bare);
      if (create) currentTable = create[1].toLowerCase();
      const alter = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/i.exec(bare);
      if (alter) currentTable = alter[1].toLowerCase();
      if (!currentTable) continue;
      const col = /^\s*(?:add\s+column\s+(?:if\s+not\s+exists\s+)?)?"?([a-z_][a-z0-9_]*)"?\s+jsonb\b/i.exec(bare);
      if (!col) continue;
      const column = col[1].toLowerCase();
      if (column === "jsonb") continue;
      found.set(`${currentTable}.${column}`, { table: currentTable, column, file });
    }
  }
  return found;
}

/** Deprecating COMMENT ON COLUMN → the successor table it names. */
export function collectDeprecatingComments(migrationSources) {
  const map = new Map(); // "schema.table.col" -> successor table name (lowercased) or null
  const re =
    /comment\s+on\s+column\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+is\s+((?:'(?:[^']|'')*'\s*)+)/gi;
  for (const raw of Object.values(migrationSources)) {
    const sql = stripDollarQuoted(raw);
    let m;
    while ((m = re.exec(sql)) !== null) {
      const key = `${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
      const literal = m[3];
      if (!/\b(retired|deprecated|archived|superseded)\b/i.test(literal)) continue;
      const successor = /([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/.exec(literal.replace(/'/g, ""));
      map.set(key, successor ? successor[1].toLowerCase() : null);
    }
  }
  return map;
}

/** BEFORE UPDATE OF <cols> ON <table> triggers → the columns each table stop-writes. */
export function collectStopWriteTriggers(migrationSources) {
  const map = new Map(); // table -> Set(columns)
  const re =
    /create\s+trigger\s+[a-z_][a-z0-9_]*\s+before\s+update\s+of\s+([a-z0-9_,"\s]+?)\s+on\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  for (const raw of Object.values(migrationSources)) {
    const sql = stripDollarQuoted(raw).replace(/\s+/g, " ");
    let m;
    while ((m = re.exec(sql)) !== null) {
      const table = m[2].toLowerCase();
      const cols = m[1]
        .split(",")
        .map((c) => c.replace(/"/g, "").trim().toLowerCase())
        .filter(Boolean);
      if (!map.has(table)) map.set(table, new Set());
      for (const c of cols) map.get(table).add(c);
    }
  }
  return map;
}

// ── The check ────────────────────────────────────────────────────────────────────────────────────

export function assertNoJsonbIdArrayAsFk({ migrations, parityTables, code, lists }) {
  const problems = [];
  const {
    metadata = METADATA_ALLOWLIST,
    open = OPEN_INSTANCES,
    codeExceptions = CODE_REFERENCE_EXCEPTIONS,
  } = lists ?? {};

  const jsonbCols = collectJsonbColumns(migrations);
  const comments = collectDeprecatingComments(migrations);
  const stopWrites = collectStopWriteTriggers(migrations);

  const metaKey = new Map(metadata.map((e) => [`${e.table}.${e.column}`.toLowerCase(), e]));
  const openKey = new Map(open.map((e) => [`${e.table}.${e.column}`.toLowerCase(), e]));

  // ARM 3a — list ceilings (a ratchet may only shrink).
  if (metadata.length > METADATA_CEILING)
    problems.push(
      `METADATA_ALLOWLIST has ${metadata.length} entries, ceiling ${METADATA_CEILING} — an exemption list that grows is not a ratchet`,
    );
  if (open.length > OPEN_CEILING)
    problems.push(
      `OPEN_INSTANCES has ${open.length} entries, ceiling ${OPEN_CEILING} — the tracked-defect list may only shrink; a new jsonb id array must be built as an FK, not appended here`,
    );
  if (codeExceptions.length > CODE_EXCEPTION_CEILING)
    problems.push(
      `CODE_REFERENCE_EXCEPTIONS has ${codeExceptions.length} entries, ceiling ${CODE_EXCEPTION_CEILING} — writers to an archived column may only be removed`,
    );

  // ARM 3b — every entry justifies itself.
  for (const e of metadata) {
    if (!e.reason || String(e.reason).trim().length < 40)
      problems.push(`METADATA_ALLOWLIST ${e.table}.${e.column}: reason is missing or too thin to review`);
  }
  for (const e of open) {
    if (!e.block || !/^[A-Z][A-Z0-9-]{3,}$/.test(String(e.block)))
      problems.push(`OPEN_INSTANCES ${e.table}.${e.column}: no owning block id — an untracked defect is a forgotten defect`);
    if (!e.reason || String(e.reason).trim().length < 40)
      problems.push(`OPEN_INSTANCES ${e.table}.${e.column}: reason is missing or too thin to review`);
  }
  for (const e of codeExceptions) {
    if (!e.block || !/^[A-Z][A-Z0-9-]{3,}$/.test(String(e.block)))
      problems.push(`CODE_REFERENCE_EXCEPTIONS ${e.file}: no owning block id`);
    if (!e.reason || String(e.reason).trim().length < 40)
      problems.push(`CODE_REFERENCE_EXCEPTIONS ${e.file}: reason is missing or too thin to review`);
  }

  // ARM 3c — no stale list entries.
  for (const [key, e] of metaKey)
    if (!jsonbCols.has(key))
      problems.push(`METADATA_ALLOWLIST ${e.table}.${e.column}: STALE — no such jsonb column in db/migrations. Delete the entry.`);
  for (const [key, e] of openKey)
    if (!jsonbCols.has(key))
      problems.push(
        `OPEN_INSTANCES ${e.table}.${e.column} (${e.block}): STALE — no such jsonb column in db/migrations. If it was normalized, delete the entry so the ratchet records the win.`,
      );

  // ARM 1 — inventory.
  const archived = [];
  for (const [key, { table, column }] of jsonbCols) {
    if (NOT_A_REFERENCE.test(column)) continue;
    if (!ENTITY_LINK_NAME.test(column)) continue;
    if (metaKey.has(key)) continue;

    const successor = comments.get(key);
    const hasDeprecatingComment = comments.has(key);
    const successorExists = Boolean(successor && parityTables.has(successor));
    const hasStopWrite = Boolean(stopWrites.get(table)?.has(column));

    if (hasDeprecatingComment && successorExists && hasStopWrite) {
      archived.push({ table, column, successor });
      if (openKey.has(key))
        problems.push(
          `OPEN_INSTANCES ${table}.${column}: listed as open but is fully ARCHIVED — delete the entry rather than leaving a resolved defect on the books`,
        );
      continue;
    }
    if (openKey.has(key)) continue; // tracked, unfixed, owned

    const missing = [];
    if (!hasDeprecatingComment) missing.push("no deprecating COMMENT ON COLUMN naming a successor table");
    else if (!successorExists)
      missing.push(
        `the COMMENT names ${successor ?? "no successor"}, which is not a real table in docs/schema-parity-baseline.json`,
      );
    if (!hasStopWrite)
      missing.push(
        `no DB-ENFORCED stop-write (needs a BEFORE UPDATE OF ${column} trigger on ${table}) — a COMMENT does not stop a writer, and "commented but still writable" is exactly the SAF-DOM-02 defect`,
      );

    problems.push(
      `${table}.${column} is a jsonb ENTITY-ID column with no enforced FK: ${missing.join("; ")}. Normalize it to a junction table with real foreign keys, or (if it is genuinely not a link) allowlist it with a reason.`,
    );
  }

  // ARM 2 — no writer left behind on an ARCHIVED column.
  const exceptionByFile = new Map(codeExceptions.map((e) => [e.file, e]));
  const usedException = new Set();
  for (const { table, column } of archived) {
    const needle = new RegExp(`\\b${column}\\b`);
    for (const [file, source] of Object.entries(code)) {
      if (!needle.test(source)) continue;
      const exc = exceptionByFile.get(file);
      if (exc && exc.columns.includes(column)) {
        usedException.add(`${file}::${column}`);
        continue;
      }
      problems.push(
        `${file} still names ${table}.${column}, which is ARCHIVED (superseded by a join table and stop-written in the DB). A write there is refused at runtime and a read there is stale — repoint it at the join table.`,
      );
    }
  }
  // ARM 3d — a code exception that no longer matches anything must be deleted.
  for (const exc of codeExceptions)
    for (const column of exc.columns)
      if (!usedException.has(`${exc.file}::${column}`))
        problems.push(
          `CODE_REFERENCE_EXCEPTIONS ${exc.file} (${exc.block}): STALE for ${column} — the file no longer names it (or the column is no longer archived). Delete the entry; an exemption that outlives its defect is a permanent hole.`,
        );

  return problems;
}

// ── I/O ──────────────────────────────────────────────────────────────────────────────────────────

function readMigrations() {
  const out = {};
  for (const f of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    if (!f.endsWith(".sql")) continue;
    out[f] = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
  }
  return out;
}

function readParityTables() {
  const raw = JSON.parse(fs.readFileSync(PARITY_BASELINE, "utf8"));
  return new Set(Object.keys(raw?.tables ?? {}).map((t) => t.toLowerCase()));
}

function readCode() {
  const out = {};
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out[path.relative(ROOT, full)] = fs.readFileSync(full, "utf8");
      }
    }
  };
  for (const d of CODE_DIRS) walk(d);
  return out;
}

function loadLive() {
  return { migrations: readMigrations(), parityTables: readParityTables(), code: readCode() };
}

// ── Self-test ────────────────────────────────────────────────────────────────────────────────────

if (SELFTEST) {
  const live = loadLive();
  const failures = [];

  const clone = () => ({
    migrations: { ...live.migrations },
    parityTables: new Set(live.parityTables),
    code: { ...live.code },
    lists: {
      metadata: METADATA_ALLOWLIST.map((e) => ({ ...e })),
      open: OPEN_INSTANCES.map((e) => ({ ...e })),
      codeExceptions: CODE_REFERENCE_EXCEPTIONS.map((e) => ({ ...e, columns: [...e.columns] })),
    },
  });

  const SUBJECT = "db/migrations/202609130000_saf_dom_02_company_violation_jsonb_archive.sql";
  const subjectKey = Object.keys(live.migrations).find((f) => f.includes("saf_dom_02_company_violation_jsonb_archive"));

  const expectCaught = (name, mutate, needle) => {
    const input = clone();
    const before = JSON.stringify([input.migrations, [...input.parityTables], input.lists, Object.keys(input.code).length]);
    mutate(input);
    const after = JSON.stringify([input.migrations, [...input.parityTables], input.lists, Object.keys(input.code).length]);
    if (before === after && !name.startsWith("code:")) {
      failures.push(`${name}: INERT — the mutation did not change the source, so the assertion proves nothing`);
      return;
    }
    const problems = assertNoJsonbIdArrayAsFk(input);
    if (!problems.some((p) => p.includes(needle)))
      failures.push(`${name}: NOT caught (needle "${needle}"). Got: ${problems.join(" | ") || "no problems"}`);
  };

  const expectClean = (name, mutate, forbiddenNeedle) => {
    const input = clone();
    mutate(input);
    const problems = assertNoJsonbIdArrayAsFk(input);
    if (problems.some((p) => p.includes(forbiddenNeedle)))
      failures.push(`${name}: FALSE POSITIVE — flagged "${forbiddenNeedle}" on a shape that is correct`);
  };

  if (!subjectKey) {
    failures.push(`selftest fixture missing: ${SUBJECT} is not on disk, so the archive arm cannot be exercised`);
  } else {
    // 1. The whole point: remove the stop-write trigger and the archive claim must collapse.
    expectCaught(
      "archive-without-stop-write-trigger",
      (i) => {
        i.migrations[subjectKey] = i.migrations[subjectKey].replace(/create\s+trigger\s+trg_reject_retired_cv_jsonb/i, "-- removed");
      },
      "no DB-ENFORCED stop-write",
    );

    // 2. A deprecating COMMENT alone is not an archive (the pre-fix main state).
    expectCaught(
      "comment-only-archive-is-not-archive",
      (i) => {
        for (const k of Object.keys(i.migrations))
          i.migrations[k] = i.migrations[k].replace(/before\s+update\s+of\s+related_drivers/gi, "before update of status");
      },
      "safety.company_violations.related_drivers is a jsonb ENTITY-ID column with no enforced FK",
    );

    // 3. A COMMENT naming a successor table that does not exist must not buy an archive.
    expectCaught(
      "successor-table-does-not-exist",
      (i) => {
        i.parityTables.delete("safety.company_violation_drivers");
      },
      "is not a real table in docs/schema-parity-baseline.json",
    );
  }

  // 4. Tomorrow's brand-new jsonb id array, in a brand-new migration.
  expectCaught(
    "brand-new-jsonb-id-array",
    (i) => {
      i.migrations["209901010000_future_regression.sql"] =
        "CREATE TABLE IF NOT EXISTS dispatch.route_plans (\n  id uuid PRIMARY KEY,\n  related_driver_ids jsonb NOT NULL DEFAULT '[]'::jsonb\n);\n";
    },
    "dispatch.route_plans.related_driver_ids is a jsonb ENTITY-ID column",
  );

  // 5. Ratchet growth.
  expectCaught(
    "open-list-grows",
    (i) => {
      for (let n = 0; n < 3; n++)
        i.lists.open.push({
          table: "safety.integrity_alerts",
          column: `related_load_ids`,
          block: "SAF-C13-01",
          reason: "padding entry used only to push the list past its ceiling in the self-test fixture",
        });
    },
    "may only shrink",
  );

  // 6. Stale OPEN entry (the column was normalized but the entry stayed).
  expectCaught(
    "stale-open-entry",
    (i) => {
      i.lists.open.push({
        table: "safety.ghost_table",
        column: "related_ghost_ids",
        block: "SAF-C13-99",
        reason: "an entry whose column does not exist anywhere in db/migrations — the rot this arm exists to catch",
      });
    },
    "STALE — no such jsonb column",
  );

  // 7. Blockless open entry.
  expectCaught(
    "open-entry-without-owning-block",
    (i) => {
      i.lists.open[0] = { ...i.lists.open[0], block: "" };
    },
    "no owning block id",
  );

  // 8. Reasonless open entry.
  expectCaught(
    "open-entry-without-reason",
    (i) => {
      i.lists.open[0] = { ...i.lists.open[0], reason: "because" };
    },
    "reason is missing or too thin",
  );

  // 9. A resolved instance parked on the open list instead of proven archived.
  expectCaught(
    "archived-column-parked-on-open-list",
    (i) => {
      i.lists.open.push({
        table: "safety.company_violations",
        column: "related_units",
        block: "SAF-DOM-02",
        reason: "parking an already-archived column here would let a future regression hide behind a tracked entry",
      });
    },
    "listed as open but is fully ARCHIVED",
  );

  // 10. A new writer to an archived column, with no exception.
  expectCaught(
    "code:new-writer-to-archived-column",
    (i) => {
      i.code["apps/backend/src/safety/rogue-writer.ts"] =
        "await client.query(`UPDATE safety.company_violations SET related_units = $1::jsonb WHERE id = $2`);";
    },
    "rogue-writer.ts still names safety.company_violations.related_units",
  );

  // 11. A stale code exception (SAF-B28 fixed, entry left behind).
  expectCaught(
    "code:stale-exception",
    (i) => {
      i.lists.codeExceptions.push({
        file: "apps/backend/src/safety/does-not-exist.ts",
        columns: ["related_drivers"],
        block: "SAF-B28",
        reason: "an exception pointing at a file that names nothing — must be deleted, not left as a permanent hole",
      });
    },
    "STALE for related_drivers",
  );

  // 12. Metadata allowlist entry without a real reason.
  expectCaught(
    "metadata-entry-without-reason",
    (i) => {
      i.lists.metadata.push({ table: "safety.company_violations", column: "related_units", reason: "meh" });
    },
    "reason is missing or too thin",
  );

  // ── Classifier controls: correct shapes must NOT be flagged. ──
  expectClean(
    "control:payload-jsonb-is-not-a-link",
    (i) => {
      i.migrations["209901010001_control_payload.sql"] =
        "CREATE TABLE IF NOT EXISTS outbox.control_probe (\n  id uuid PRIMARY KEY,\n  payload jsonb NOT NULL\n);\n";
    },
    "outbox.control_probe.payload",
  );
  expectClean(
    "control:plpgsql-variable-is-not-a-column",
    (i) => {
      i.migrations["209901010002_control_plpgsql.sql"] =
        "CREATE OR REPLACE FUNCTION safety.control_probe() RETURNS void LANGUAGE plpgsql AS $f$\nDECLARE\n  v_related_driver_ids jsonb;\nBEGIN\n  v_related_driver_ids := '[]'::jsonb;\nEND;\n$f$;\n";
    },
    "v_related_driver_ids",
  );
  expectClean(
    "control:real-uuid-fk-column-is-not-flagged",
    (i) => {
      i.migrations["209901010003_control_fk.sql"] =
        "CREATE TABLE IF NOT EXISTS safety.control_link (\n  id uuid PRIMARY KEY,\n  driver_id uuid NOT NULL REFERENCES mdata.drivers(id)\n);\n";
    },
    "safety.control_link.driver_id",
  );

  if (failures.length) {
    console.error(`[${LABEL} --selftest] FAILED — ${failures.length} assertion(s) are not real:`);
    for (const f of failures) console.error(`  x ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL} --selftest] OK — 12 planted defects caught, 3 classifier controls clean.`);
  process.exit(0);
}

// ── Live run ─────────────────────────────────────────────────────────────────────────────────────

const problems = assertNoJsonbIdArrayAsFk({ ...loadLive(), lists: {} });

if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  x ${p}`);
  console.error("");
  console.error("  A jsonb array of entity ids is a memo, not a link: no FK, no cascade, no reverse read.");
  console.error("  Normalize to a junction table with real foreign keys (see SAF-DOM-02), or allowlist");
  console.error("  a genuine metadata column with a stated reason. Do not widen the classifier.");
  process.exit(1);
}

console.log(
  `[${LABEL}] PASS — every jsonb entity-id column is either normalized-and-archived (successor table + deprecating COMMENT + DB-enforced stop-write), allowlisted metadata (${METADATA_ALLOWLIST.length}), or a tracked open instance (${OPEN_INSTANCES.length}/${OPEN_CEILING}).`,
);
