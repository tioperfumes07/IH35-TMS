#!/usr/bin/env node
/**
 * GUARD — TOOL-F04. A migration that MUTATES EXISTING ROWS must carry evidence that it was rehearsed
 * against a COPY OF PRODUCTION, not only against a fresh database.
 *
 * THE OUTAGE THIS COMES FROM (2026-07-30, ~5.5 hours). Migration 202610260000 set `deactivated_at` on
 * mdata.drivers without moving `status`, violating chk_drivers_status_deactivated_consistent. It failed
 * in Render's preDeploy, and because `db:migrate` is the FIRST link of
 *     db:migrate && db:verify:critical-runtime && ci:boot-api-smoke && ci:boot-aggregate-smoke
 * the whole chain aborted. The migration stayed pending, so EVERY later deploy retried it and failed —
 * six consecutive failed deploys, two of them Cursor's, none of which had anything to do with it.
 *
 * THE PART THAT MATTERS: CI DID RUN THAT MIGRATION AND CI PASSED. `verify:db:reset` replays every
 * migration on a FRESH database — which has the constraint, but has NO DATA. The UPDATE matched zero
 * rows, so the constraint never fired. A fresh-database replay proves a migration is SYNTACTICALLY and
 * STRUCTURALLY sound; it cannot prove it is safe against real rows, because there are none. Any
 * data-dependent failure — constraints, triggers, RLS write policies, FK violations, uniqueness — is
 * invisible to it. That is a vacuous pass, and it is exactly the "fake green" this project forbids.
 *
 * The local fixture had the same hole from the other side: it reproduced prod's DATA SHAPE but not its
 * CONSTRAINTS or TRIGGERS, so it could never have failed either. Two green signals, neither of which
 * was testing the thing that broke.
 *
 * WHAT THIS GUARD REQUIRES. If a new migration contains DML against existing rows (UPDATE / DELETE /
 * INSERT ... SELECT), its commit message must carry a REHEARSED: line stating where it was replayed
 * with real data. The intended rehearsal is a Neon branch forked from the prod branch — it carries the
 * real constraints, triggers, policies AND rows — then the pending chain applied in order. That is how
 * this outage was actually diagnosed and fixed.
 *
 * Pure-DDL migrations (CREATE INDEX/TABLE, ALTER ... ADD CONSTRAINT with no row rewrite) are NOT
 * required to carry it: a fresh-database replay genuinely does prove those.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const LABEL = "verify:data-migrations-rehearsed";

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

/** Strip SQL comments so prose about an UPDATE is not mistaken for one. */
export function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/** True when the migration changes EXISTING rows, i.e. its behaviour depends on real data. */
export function mutatesExistingRows(sql) {
  const s = stripSqlComments(sql);
  if (/\bUPDATE\s+[a-z_]+\.[a-z_]+/i.test(s)) return true;
  if (/\bDELETE\s+FROM\s+[a-z_]+\.[a-z_]+/i.test(s)) return true;
  // INSERT ... SELECT reads existing rows; a plain INSERT ... VALUES of seed data does not.
  if (/\bINSERT\s+INTO\s+[\s\S]{0,4000}?\bSELECT\b/i.test(s)) return true;
  return false;
}

export function hasRehearsalEvidence(message) {
  return /^\s*REHEARSED:\s*\S+/m.test(message);
}

export function analyse(migrations, message) {
  const problems = [];
  const dataMigrations = migrations.filter((m) => mutatesExistingRows(m.sql)).map((m) => m.file);
  if (dataMigrations.length > 0 && !hasRehearsalEvidence(message)) {
    problems.push(
      `${dataMigrations.length} migration(s) mutate EXISTING rows (${dataMigrations.join(", ")}) but the ` +
        `commit message has no "REHEARSED:" line. A fresh-database replay passes VACUOUSLY on an empty ` +
        `table — that is how 202610260000 went green in CI and then blocked production deploys for ~5.5 ` +
        `hours. Rehearse the pending chain on a Neon branch forked from the prod branch (real ` +
        `constraints, triggers, policies AND rows) and record it, e.g.:\n` +
        `      REHEARSED: Neon branch br-… forked from br-fancy-credit-akjnd07a — chain applied in order, N rows changed`
    );
  }
  return { problems, dataMigrations };
}

export function run(baseRef = "origin/main") {
  let files = [];
  try {
    files = git(["diff", "--name-only", "--diff-filter=A", `${baseRef}...HEAD`, "--", "db/migrations/"])
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.endsWith(".sql"));
  } catch {
    return { ok: true, message: `${LABEL} SKIP — cannot diff against ${baseRef}` };
  }
  if (files.length === 0) return { ok: true, message: `${LABEL} OK — no new migrations` };

  const migrations = files.map((file) => ({ file, sql: readFileSync(file, "utf8") }));
  // The evidence may live on ANY commit in the branch range, not just HEAD. Reading only HEAD forced
  // every follow-up commit on a branch to repeat the REHEARSED line verbatim — so a later, unrelated
  // commit (a frontend client, a doc fix) would fail the guard even though the migration it is asking
  // about was rehearsed and recorded two commits earlier. That is friction with no safety value, and
  // it pushes toward copy-pasting evidence, which is how evidence stops meaning anything.
  const message = git(["log", `${baseRef}..HEAD`, "--format=%B"]) || git(["log", "-1", "--format=%B"]);
  const { problems, dataMigrations } = analyse(migrations, message);

  if (problems.length > 0) return { ok: false, message: `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}` };
  return {
    ok: true,
    message:
      dataMigrations.length > 0
        ? `${LABEL} OK — ${dataMigrations.length} data-mutating migration(s), rehearsal evidence present`
        : `${LABEL} OK — ${files.length} migration(s), none mutate existing rows`,
  };
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const UPD = { file: "a.sql", sql: "UPDATE mdata.drivers SET deactivated_at = now();" };
  const DDL = { file: "b.sql", sql: "CREATE UNIQUE INDEX IF NOT EXISTS ux_x ON banking.bank_accounts (id);" };
  const SEED = { file: "c.sql", sql: "INSERT INTO catalogs.things (id, name) VALUES (gen_random_uuid(), 'x');" };
  const INSSEL = { file: "d.sql", sql: "INSERT INTO a.b (x) SELECT y FROM c.d;" };
  const DEL = { file: "e.sql", sql: "DELETE FROM mdata.units WHERE id = $1;" };
  const PROSE = { file: "f.sql", sql: "-- this migration does not UPDATE mdata.drivers at all\nSELECT 1;" };

  t("UPDATE without evidence fails", analyse([UPD], "no evidence here").problems.length === 1);
  t("UPDATE with evidence passes", analyse([UPD], "REHEARSED: Neon branch br-x").problems.length === 0);
  t("pure DDL needs no evidence", analyse([DDL], "nothing").problems.length === 0);
  t("plain INSERT VALUES needs no evidence", analyse([SEED], "nothing").problems.length === 0);
  t("INSERT ... SELECT needs evidence", analyse([INSSEL], "nothing").problems.length === 1);
  t("DELETE needs evidence", analyse([DEL], "nothing").problems.length === 1);
  t("an UPDATE mentioned only in a COMMENT is not DML", analyse([PROSE], "nothing").problems.length === 0);
  t("failure names the offending file", analyse([UPD], "x").problems[0].includes("a.sql"));
  // Mutation arm: the detector must be capable of returning false, or every arm above is meaningless.
  t("mutation: a non-DML migration is not flagged", mutatesExistingRows(DDL.sql) === false);
  return bad;
}

// Only act when invoked as a CLI. Importing this module must be side-effect free, or it cannot be
// unit-tested or reused — the first version called run() and process.exit() at import time.
const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith("verify-data-migrations-rehearsed.mjs");

if (INVOKED_DIRECTLY) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 9 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const res = run();
  console.log(res.message);
  process.exit(res.ok ? 0 : 1);
}
