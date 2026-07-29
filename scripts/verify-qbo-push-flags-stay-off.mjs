#!/usr/bin/env node
/**
 * PARALLEL BOOKS — the QBO push flags must never be turned on by a migration.
 *
 * Owner law, stated repeatedly and without qualification: "QBO_JE_PUSH_ENABLED and
 * QBO_ENTITY_PUSH_ENABLED STAY OFF for all entities. Parallel books: we sync FROM QBO and reconcile;
 * we NEVER write back to QBO."
 *
 * QuickBooks is the system of record. A write-back would let this system mutate the books an outside
 * CPA reconciles and an outside lender relies on — the one direction the architecture forbids.
 * That law currently lives only in prose, which means the next agent enabling a batch of QBO flags
 * could sweep these two in without anyone noticing until entries appeared in QBO. This guard makes it
 * a CI failure instead of a discovery.
 *
 * WHAT IT ASSERTS: no migration writes an ENABLED (true) override, or a true default, for either
 * push flag. Explicit disables (enabled = false) are fine — those are the law being enforced.
 *
 * Deliberately narrow: it reads db/migrations only. Runtime state is verified separately against Neon;
 * a static guard cannot see the database, and pretending otherwise would be the fake-green this repo
 * has been burned by.
 */
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");
const PUSH_FLAGS = ["QBO_JE_PUSH_ENABLED", "QBO_ENTITY_PUSH_ENABLED"];

/**
 * Strip SQL line comments before scanning. Every migration that touches these flags DISCUSSES them in
 * a comment saying they stay off — matching on comment text would make this guard fire on the very
 * documentation that states the law. Only executable SQL counts.
 */
function stripComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/**
 * Find statements that could switch a push flag ON. A statement qualifies when it mentions the flag
 * AND assigns a true — either `enabled` / `default_enabled` set true, or the flag appearing in a
 * VALUES tuple alongside a bare `true`. Balanced-brace-style extraction is unnecessary here because
 * the unit is the statement, delimited by `;`.
 */
function offendingStatements(sql) {
  const clean = stripComments(sql);
  const statements = clean.split(";");
  const offenders = [];

  for (const stmt of statements) {
    const flat = stmt.replace(/\s+/g, " ").trim();
    if (!flat) continue;

    const flag = PUSH_FLAGS.find((f) => flat.includes(f));
    if (!flag) continue;

    // An assignment of true to the enablement column, or a literal true in the same statement as the
    // flag key. The second is broad on purpose: a false positive here costs one comment, a false
    // negative costs a write-back to the company's books of record.
    const setsTrue =
      /\b(enabled|default_enabled)\s*=\s*true\b/i.test(flat) ||
      /\btrue\b/i.test(flat);

    // `enabled = false` / an explicit false-only statement is the law being applied, not violated.
    const onlyFalse = /\btrue\b/i.test(flat) === false;

    if (setsTrue && !onlyFalse) {
      offenders.push({ flag, statement: flat.slice(0, 240) });
    }
  }
  return offenders;
}

/**
 * SELFTEST — prove the detector actually fires, by writing a REAL violating migration to the REAL
 * directory and scanning it the same way CI does, then removing it. An in-memory fixture would prove
 * only that a string matches a regex; this proves the scan path reaches disk and flags what it finds.
 * Run separately from the main scan so a selftest artifact can never leak into a real verdict.
 */
function selftest() {
  const probe = join(MIGRATIONS_DIR, "999999999999_qbo_push_flag_selftest_probe.sql");
  const cases = [
    { sql: "UPDATE lib.feature_flag_overrides SET enabled = true WHERE flag_key = 'QBO_JE_PUSH_ENABLED';", detect: true, why: "enables the JE push flag" },
    { sql: "INSERT INTO lib.feature_flags (flag_key, default_enabled) VALUES ('QBO_ENTITY_PUSH_ENABLED', true);", detect: true, why: "registers the entity push flag defaulting ON" },
    { sql: "UPDATE lib.feature_flag_overrides SET enabled = false WHERE flag_key = 'QBO_JE_PUSH_ENABLED';", detect: false, why: "explicitly DISABLES it — the law being applied, must not fire" },
    { sql: "-- QBO_JE_PUSH_ENABLED stays off for all entities; true parallel books.\nSELECT 1;", detect: false, why: "comment prose only — must not fire" },
  ];

  let failures = 0;
  for (const [i, c] of cases.entries()) {
    writeFileSync(probe, c.sql, "utf8");
    let fired;
    try {
      fired = offendingStatements(readFileSync(probe, "utf8")).length > 0;
    } finally {
      unlinkSync(probe);
    }
    if (fired !== c.detect) {
      console.error(`  selftest case ${i + 1} FAIL — expected detect=${c.detect}, got ${fired} (${c.why})`);
      failures += 1;
    } else {
      console.log(`  selftest case ${i + 1} OK — detect=${fired} (${c.why})`);
    }
  }

  if (failures > 0) {
    console.error(`verify-qbo-push-flags-stay-off SELFTEST FAIL — ${failures} of ${cases.length} cases wrong`);
    process.exit(1);
  }
  console.log(`verify-qbo-push-flags-stay-off SELFTEST OK — ${cases.length}/${cases.length} cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    console.error(`verify-qbo-push-flags-stay-off FAIL — cannot read ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    // Zero files is not a pass. An empty scan reporting green is exactly the fake-green this repo
    // has paid for before: the denominator has to be real.
    console.error("verify-qbo-push-flags-stay-off FAIL — scanned 0 migrations; refusing to report green");
    process.exit(1);
  }

  const violations = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const o of offendingStatements(sql)) {
      violations.push({ file, ...o });
    }
  }

  if (violations.length > 0) {
    console.error("verify-qbo-push-flags-stay-off FAIL — a migration would enable a QBO write-back flag.");
    console.error("QuickBooks is the system of record. This system NEVER writes back. (Owner law.)\n");
    for (const v of violations) {
      console.error(`  ${v.file}\n    flag: ${v.flag}\n    stmt: ${v.statement}\n`);
    }
    process.exit(1);
  }

  console.log(
    `verify-qbo-push-flags-stay-off OK — ${files.length} migrations scanned, ` +
      `0 enable QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED`
  );
}

main();
