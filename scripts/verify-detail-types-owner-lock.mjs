#!/usr/bin/env node
/**
 * ACCT-F03 guard — regression lock: catalogs.accounts.account_subtype stays TEXT by owner decision.
 *
 * FAILs if any migration (or repo source outside an unlock-marked migration) introduces:
 *   - catalogs.accounts.detail_type_id column
 *   - inbound FK from catalogs.accounts → catalogs.detail_types
 *   - ALTER of account_subtype away from text/uuid-without-unlock
 *
 * PASSes while the owner lock is documented and ACCT-LINK-02 remains an honest owner HOLD.
 *
 * Unlock path: migration must contain DETAIL_TYPES_FK_OWNER_UNLOCK (written owner approval).
 *
 * --selftest mutates REAL migration text and accounting.json; one assertion per planted defect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-detail-types-owner-lock";
const UNLOCK_MARKER = "DETAIL_TYPES_FK_OWNER_UNLOCK";

const LOCK_DOC = "docs/trackers/ACCT-F03-DETAIL-TYPES-OWNER-LOCK-2026-07-25.md";
const WIRING_DOC = "docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md";
const ACCOUNTING_JSON = "docs/module-completion/accounting.json";
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");

const FORBIDDEN_IN_MIGRATION = [
  {
    id: "detail_type_id_column",
    re: /ALTER TABLE\s+catalogs\.accounts[\s\S]{0,400}ADD COLUMN(?: IF NOT EXISTS)?\s+detail_type_id\b/i,
    msg: "must not ADD catalogs.accounts.detail_type_id without owner unlock",
  },
  {
    id: "accounts_fk_detail_types",
    re: /REFERENCES\s+catalogs\.detail_types\b/i,
    msg: "must not REFERENCES catalogs.detail_types from a migration without owner unlock",
  },
  {
    id: "account_subtype_uuid",
    re: /ALTER TABLE\s+catalogs\.accounts[\s\S]{0,400}ALTER COLUMN\s+account_subtype\s+TYPE\s+uuid/i,
    msg: "must not ALTER account_subtype to uuid without owner unlock",
  },
];

function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function loadMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));
}

/** Scan migrations; forbidden patterns allowed only when UNLOCK_MARKER is in the same file. */
export function analyzeMigrations(migrations) {
  const failures = [];
  for (const { file, sql } of migrations) {
    if (sql.includes(UNLOCK_MARKER)) continue;
    for (const rule of FORBIDDEN_IN_MIGRATION) {
      if (rule.re.test(sql)) {
        failures.push(`${file}: ${rule.msg} (add ${UNLOCK_MARKER} to the same migration after written owner unlock)`);
      }
    }
  }
  return failures;
}

/** Owner lock must be recorded in the tracker doc + wiring doc + module manifest. */
export function analyzeOwnerLockDocs(sources) {
  const failures = [];
  const lockDoc = sources[LOCK_DOC] ?? read(LOCK_DOC);
  const wiringDoc = sources[WIRING_DOC] ?? read(WIRING_DOC);
  const accountingJson = sources[ACCOUNTING_JSON] ?? read(ACCOUNTING_JSON);

  if (!lockDoc) {
    failures.push(`missing ${LOCK_DOC}`);
  } else {
    if (!/account_subtype stays TEXT|OWNER LOCK.*TEXT/i.test(lockDoc)) {
      failures.push(`${LOCK_DOC}: must state account_subtype stays TEXT (owner lock)`);
    }
    if (!/DETAIL_TYPES_FK_OWNER_UNLOCK/.test(lockDoc)) {
      failures.push(`${LOCK_DOC}: must document the ${UNLOCK_MARKER} pre-condition`);
    }
    if (!/no `detail_type_id` column|no detail_type_id column/i.test(lockDoc)) {
      failures.push(`${LOCK_DOC}: must record that detail_type_id is forbidden without unlock`);
    }
  }

  if (!wiringDoc) {
    failures.push(`missing ${WIRING_DOC}`);
  } else if (!/detail_types[\s\S]{0,200}text subtype lock|Do NOT wire an\s+FK/i.test(wiringDoc)) {
    failures.push(`${WIRING_DOC}: §A.1 must record detail_types TEXT subtype owner lock`);
  }

  if (!accountingJson) {
    failures.push(`missing ${ACCOUNTING_JSON}`);
  } else {
    let data;
    try {
      data = JSON.parse(accountingJson);
    } catch {
      failures.push(`${ACCOUNTING_JSON}: invalid JSON`);
      return failures;
    }
    const link02 = data.items?.find((it) => it.id === "ACCT-LINK-02");
    if (!link02) {
      failures.push(`${ACCOUNTING_JSON}: missing ACCT-LINK-02`);
    } else {
      if (link02.status === "PASS") {
        failures.push(`${ACCOUNTING_JSON}: ACCT-LINK-02 must not be PASS — FK is owner-locked, not wired`);
      }
      if (link02.status !== "HOLD" || link02.owner_hold !== true) {
        failures.push(`${ACCOUNTING_JSON}: ACCT-LINK-02 must be HOLD with owner_hold:true (owner lock recorded)`);
      }
      if (!/OWNER.?LOCK|owner lock|TEXT/i.test(link02.evidence || "")) {
        failures.push(`${ACCOUNTING_JSON}: ACCT-LINK-02.evidence must cite the TEXT owner lock`);
      }
      if (!link02.tracker || !String(link02.tracker).includes("ACCT-F03")) {
        failures.push(`${ACCOUNTING_JSON}: ACCT-LINK-02.tracker must point at ACCT-F03 owner-lock doc`);
      }
      if (!link02.future_block) {
        failures.push(`${ACCOUNTING_JSON}: ACCT-LINK-02.future_block required for qualifying HOLD`);
      }
    }
  }

  return failures;
}

export function collectFailures(sources = {}) {
  return [...analyzeMigrations(sources.migrations ?? loadMigrations()), ...analyzeOwnerLockDocs(sources)];
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const realMigrations = loadMigrations();
  if (realMigrations.length === 0) failures.push("selftest: no migrations dir");

  const realSources = {
    migrations: realMigrations,
    [LOCK_DOC]: read(LOCK_DOC),
    [WIRING_DOC]: read(WIRING_DOC),
    [ACCOUNTING_JSON]: read(ACCOUNTING_JSON),
  };

  const goodFailures = collectFailures(realSources);
  if (goodFailures.length) {
    failures.push(`real repo flagged when it should PASS: ${goodFailures.join(" | ")}`);
  }

  // Case: forbidden FK in a migration without unlock marker — must flag.
  const sample = realMigrations[0];
  if (sample) {
    const badMigrations = realMigrations.map((m) =>
      m.file === sample.file
        ? {
            ...m,
            sql:
              m.sql +
              "\nALTER TABLE catalogs.accounts ADD COLUMN detail_type_id uuid REFERENCES catalogs.detail_types(id);\n",
          }
        : m
    );
    const badMigFailures = analyzeMigrations(badMigrations);
    if (!badMigFailures.some((f) => f.includes("detail_type_id") || f.includes("detail_types"))) {
      failures.push("selftest: planted detail_type_id FK migration was NOT flagged");
    }
  }

  // Case: unlock-marked migration with FK — must NOT flag.
  if (sample) {
    const unlockedMigrations = realMigrations.map((m) =>
      m.file === sample.file
        ? {
            ...m,
            sql:
              `${UNLOCK_MARKER}\n` +
              m.sql +
              "\nALTER TABLE catalogs.accounts ADD COLUMN detail_type_id uuid REFERENCES catalogs.detail_types(id);\n",
          }
        : m
    );
    const unlockedFailures = analyzeMigrations(unlockedMigrations);
    if (unlockedFailures.some((f) => f.includes(sample.file) && f.includes("detail_type"))) {
      failures.push("selftest: unlock-marked migration was incorrectly flagged");
    }
  }

  // Case: ACCT-LINK-02 flipped to PASS — must flag.
  const realJson = read(ACCOUNTING_JSON);
  if (realJson) {
    const flippedJson = realJson.replace(
      /("id":\s*"ACCT-LINK-02"[\s\S]{0,500}?"status":\s*)"HOLD"/,
      '$1"PASS"'
    );
    const flippedFailures = analyzeOwnerLockDocs({ ...realSources, [ACCOUNTING_JSON]: flippedJson });
    if (!flippedFailures.some((f) => f.includes("ACCT-LINK-02") && f.includes("PASS"))) {
      failures.push("selftest: flipping ACCT-LINK-02 to PASS was NOT flagged");
    }
  }

  // Case: strip owner lock doc — must flag.
  const strippedDoc = (read(LOCK_DOC) || "")
    .replace(/OWNER LOCK/g, "maybe wire")
    .replace(/account_subtype stays TEXT/gi, "wire FK now");
  const strippedFailures = analyzeOwnerLockDocs({ ...realSources, [LOCK_DOC]: strippedDoc });
  if (!strippedFailures.some((f) => f.includes(LOCK_DOC))) {
    failures.push("selftest: stripped owner lock doc was NOT flagged");
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: PASS`);
  process.exit(0);
}

const failures = collectFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — account_subtype TEXT owner lock recorded; forbidden detail_types FK blocked without ${UNLOCK_MARKER}`
);
process.exit(0);
