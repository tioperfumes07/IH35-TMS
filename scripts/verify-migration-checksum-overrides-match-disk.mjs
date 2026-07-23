#!/usr/bin/env node
/**
 * GUARD: every migration checksum override still matches the file on disk.
 *
 * WHY THIS EXISTS (PROD DEPLOY OUTAGE, 2026-07-23)
 * `scripts/db-migrate.mjs` aborts the whole prod pre-deploy when a migration's disk checksum differs
 * from the checksum recorded in the prod ledger ("was modified after apply"). Because db:migrate is
 * the FIRST step of Render's preDeployCommand, that abort blocks EVERY backend deploy — 8 consecutive
 * deploys failed and prod sat on a stale sha for ~90 minutes with a green health endpoint, so nothing
 * looked broken from the outside.
 *
 * `migration-checksum-overrides.json` is the sanctioned escape hatch, but it is matched EXACTLY on
 * BOTH sides (`isChecksumOverrideMatch`: ledger_checksum AND disk_checksum must both equal). So an
 * override silently stops working the moment anyone edits the migration file again by one byte — and
 * nothing in CI noticed, because `verify-ledger-parity-static.mjs` never hashes the files. The repair
 * for that class of break is only visible in a Render log, after prod is already stuck.
 *
 * This guard closes that: it re-hashes every referenced migration and fails in CI instead of at deploy.
 * It deliberately does NOT check the ledger side — that lives in the prod DB and is not knowable
 * statically. It checks the half that IS knowable, which is the half that goes stale from a code edit.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OVERRIDES = "scripts/lib/migration-checksum-overrides.json";
const MIGRATIONS_DIR = "db/migrations";
const LABEL = "verify-migration-checksum-overrides-match-disk";
const SELFTEST = process.argv.includes("--selftest");
const HEX64 = /^[0-9a-f]{64}$/;

const sha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

/**
 * @param entries parsed override array (defaults to the real file)
 * @param readMigration (filename) => string | null — defaults to reading db/migrations
 */
export function assertOverridesMatchDisk(entries, readMigration) {
  const list =
    entries ?? JSON.parse(fs.readFileSync(path.join(ROOT, OVERRIDES), "utf8"));
  const read =
    readMigration ??
    ((filename) => {
      const p = path.join(ROOT, MIGRATIONS_DIR, filename);
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
    });
  const problems = [];

  if (!Array.isArray(list)) {
    problems.push(`${OVERRIDES}: expected a JSON array of override entries.`);
    return problems;
  }

  const seen = new Set();
  for (const entry of list) {
    const filename = entry?.filename;
    if (!filename) {
      problems.push(`${OVERRIDES}: an entry has no filename — db:migrate silently ignores it.`);
      continue;
    }
    if (seen.has(filename)) {
      problems.push(`${OVERRIDES}: duplicate entry for ${filename} — the later one wins silently.`);
    }
    seen.add(filename);

    // ledger_checksum is whatever the PROD LEDGER literally holds, and that is not always a hash:
    // 0162 legitimately carries `manual-apply-1778758391.834389` because it was applied by hand.
    // db:migrate does a plain string equality against the ledger value, so any non-empty string is
    // valid here — asserting hex would flag a working override (it did, on the first run of this guard).
    if (!entry?.ledger_checksum || String(entry.ledger_checksum).trim() === "") {
      problems.push(`${OVERRIDES}: ${filename} has an empty ledger_checksum — db:migrate skips entries lacking either checksum, so the override would not apply.`);
    }
    // disk_checksum IS compared against a computed sha256, so it must be one.
    if (!entry?.disk_checksum || !HEX64.test(entry.disk_checksum)) {
      problems.push(`${OVERRIDES}: ${filename} has a missing/malformed disk_checksum — it is compared against a computed sha256, so a non-hex value can never match.`);
    }
    if (!entry?.reason || String(entry.reason).trim().length < 10) {
      problems.push(`${OVERRIDES}: ${filename} has no substantive reason — an unexplained checksum override is unauditable.`);
    }

    const source = read(filename);
    if (source === null) {
      problems.push(`${OVERRIDES}: ${filename} does not exist in ${MIGRATIONS_DIR}/ — the override points at nothing.`);
      continue;
    }
    const actual = sha256(source);
    if (entry?.disk_checksum && HEX64.test(entry.disk_checksum) && actual !== entry.disk_checksum) {
      problems.push(
        `${OVERRIDES}: ${filename} disk_checksum is STALE (recorded ${entry.disk_checksum.slice(0, 12)}…, file is now ${actual.slice(0, 12)}…). ` +
          `db:migrate matches BOTH checksums exactly, so this override no longer applies and the next prod pre-deploy will abort on "modified after apply".`
      );
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, OVERRIDES), "utf8"));
  const realRead = (filename) => {
    const p = path.join(ROOT, MIGRATIONS_DIR, filename);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };
  const failures = [];
  const expectCaught = (name, entries, read, needle) => {
    if (JSON.stringify(entries) === JSON.stringify(live) && read === realRead) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertOverridesMatchDisk(entries, read);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  const clone = () => JSON.parse(JSON.stringify(live));

  // 1. the migration file is edited after the override was recorded (the outage's exact shape).
  expectCaught(
    "disk-checksum-went-stale",
    live,
    (filename) => {
      const src = realRead(filename);
      return src === null ? null : src + "\n-- an innocent one-line edit\n";
    },
    "disk_checksum is STALE"
  );
  // 2. the override points at a migration that no longer exists.
  const missing = clone();
  missing[0].filename = "999999_this_migration_does_not_exist.sql";
  expectCaught("override-points-at-nothing", missing, realRead, "does not exist in db/migrations/");
  // 3. a malformed checksum — db:migrate would skip the entry entirely.
  const malformed = clone();
  malformed[0].disk_checksum = "not-a-sha";
  expectCaught("malformed-disk-checksum", malformed, realRead, "missing/malformed disk_checksum");
  const emptyLedger = clone();
  emptyLedger[0].ledger_checksum = "";
  expectCaught("empty-ledger-checksum", emptyLedger, realRead, "empty ledger_checksum");
  // 4. an unexplained override.
  const unexplained = clone();
  unexplained[0].reason = "";
  expectCaught("no-reason", unexplained, realRead, "no substantive reason");
  // 5. duplicate entries for one migration.
  const duped = clone();
  duped.push(JSON.parse(JSON.stringify(duped[0])));
  expectCaught("duplicate-entry", duped, realRead, "duplicate entry for");

  // The corrected shape must NOT be flagged — false positives burn trust as fast as misses.
  const liveProblems = assertOverridesMatchDisk(live, realRead);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 planted defects caught, live overrides clean`);
  process.exit(0);
}

const problems = assertOverridesMatchDisk();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
const count = JSON.parse(fs.readFileSync(path.join(ROOT, OVERRIDES), "utf8")).length;
console.log(`${LABEL} OK — all ${count} checksum overrides still match their migration on disk`);
