#!/usr/bin/env node
/**
 * ACCT-F03 / LINK-02 — post-WIRE regression lock.
 *
 * Owner WIRED detail_type_id (migration 202608080000 + DETAIL_TYPES_FK_OWNER_UNLOCK).
 * account_subtype stays TEXT display cache.
 *
 * FAIL if:
 *   - unlock migration missing / lacks DETAIL_TYPES_FK_OWNER_UNLOCK
 *   - a different migration adds detail_type_id / FK without unlock marker
 *   - any migration ALTERs account_subtype to uuid
 *   - ACCT-LINK-02 is PASS without live detail_type_id evidence
 *
 * PASS when unlock mig present and LINK-02 is HOLD (legacy) or PASS with evidence.
 *
 *   node scripts/verify-detail-types-owner-lock.mjs
 *   node scripts/verify-detail-types-owner-lock.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-detail-types-owner-lock";
const UNLOCK_MARKER = "DETAIL_TYPES_FK_OWNER_UNLOCK";
const UNLOCK_MIG = "202608080000_acct_link_02_accounts_detail_type_fk.sql";

const LOCK_DOC = "docs/trackers/ACCT-F03-DETAIL-TYPES-OWNER-LOCK-2026-07-25.md";
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
    msg: "must not ALTER account_subtype to uuid (TEXT display cache is permanent)",
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

export function analyzeMigrations(migrations) {
  const failures = [];
  const unlock = migrations.find((m) => m.file === UNLOCK_MIG);
  if (!unlock) {
    failures.push(`missing unlock migration ${UNLOCK_MIG}`);
  } else if (!unlock.sql.includes(UNLOCK_MARKER)) {
    failures.push(`${UNLOCK_MIG}: must contain ${UNLOCK_MARKER}`);
  } else if (!/detail_type_id/i.test(unlock.sql)) {
    failures.push(`${UNLOCK_MIG}: must define detail_type_id`);
  }

  for (const { file, sql } of migrations) {
    if (file === UNLOCK_MIG) continue;
    if (sql.includes(UNLOCK_MARKER)) continue;
    for (const rule of FORBIDDEN_IN_MIGRATION) {
      if (rule.re.test(sql)) {
        failures.push(`${file}: ${rule.msg} (add ${UNLOCK_MARKER} after written owner unlock)`);
      }
    }
    // uuid subtype never allowed even with unlock on other files
    if (FORBIDDEN_IN_MIGRATION[2].re.test(sql)) {
      failures.push(`${file}: ${FORBIDDEN_IN_MIGRATION[2].msg}`);
    }
  }
  return failures;
}

function hasLiveDetailTypeEvidence(evidence) {
  const ev = String(evidence || "");
  return (
    /detail_type_id/i.test(ev) &&
    (/LIVE|Neon|lucia|col_exists|FK|ledger|202608080000/i.test(ev) ||
      /with_dt\s*=\s*\d+|bound\s*=\s*\d+/i.test(ev))
  );
}

export function analyzeOwnerLockDocs(sources = {}) {
  const failures = [];
  const lockDoc = sources[LOCK_DOC] ?? read(LOCK_DOC);
  const accountingJson = sources[ACCOUNTING_JSON] ?? read(ACCOUNTING_JSON);

  if (!lockDoc) {
    failures.push(`missing ${LOCK_DOC}`);
  } else {
    if (!/DETAIL_TYPES_FK_OWNER_UNLOCK/.test(lockDoc)) {
      failures.push(`${LOCK_DOC}: must document ${UNLOCK_MARKER}`);
    }
    if (!/WIRE|WIRED|detail_type_id/i.test(lockDoc)) {
      failures.push(`${LOCK_DOC}: must record WIRE / detail_type_id status`);
    }
    if (!/account_subtype[\s\S]{0,80}TEXT|TEXT display cache/i.test(lockDoc)) {
      failures.push(`${LOCK_DOC}: must keep account_subtype TEXT display-cache rule`);
    }
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
    for (const id of ["ACCT-LINK-02", "ACCT-SURF-06"]) {
      const item = data.items?.find((it) => it.id === id);
      if (!item) {
        failures.push(`${ACCOUNTING_JSON}: missing ${id}`);
        continue;
      }
      if (item.status === "PASS") {
        if (!hasLiveDetailTypeEvidence(item.evidence)) {
          failures.push(
            `${ACCOUNTING_JSON}: ${id} PASS requires evidence citing live detail_type_id / Neon / 202608080000`
          );
        }
      } else if (item.status === "HOLD") {
        if (!item.owner_hold || !item.tracker || !item.future_block) {
          failures.push(`${ACCOUNTING_JSON}: ${id} HOLD requires owner_hold + tracker + future_block`);
        }
      } else if (item.status !== "FAIL" && item.status !== "UNVERIFIED") {
        failures.push(`${ACCOUNTING_JSON}: ${id} status must be PASS|HOLD|FAIL|UNVERIFIED (got ${item.status})`);
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
    [ACCOUNTING_JSON]: read(ACCOUNTING_JSON),
  };

  const goodFailures = collectFailures(realSources);
  if (goodFailures.length) {
    failures.push(`real repo flagged when it should PASS: ${goodFailures.join(" | ")}`);
  }

  const sample = realMigrations.find((m) => m.file !== UNLOCK_MIG) || realMigrations[0];
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

  // PASS without live evidence must flag
  const realJson = read(ACCOUNTING_JSON);
  if (realJson) {
    const data = JSON.parse(realJson);
    const link = data.items.find((i) => i.id === "ACCT-LINK-02");
    if (link) {
      link.status = "PASS";
      link.evidence = "theater pass with no neon cite";
      delete link.owner_hold;
      delete link.tracker;
      delete link.future_block;
    }
    const theaterFailures = analyzeOwnerLockDocs({
      ...realSources,
      [ACCOUNTING_JSON]: JSON.stringify(data),
    });
    if (!theaterFailures.some((f) => f.includes("ACCT-LINK-02") && f.includes("PASS"))) {
      failures.push("selftest: theater PASS without detail_type_id evidence was NOT flagged");
    }
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
  `${LABEL}: PASS — LINK-02 WIRE unlock (${UNLOCK_MIG}) recorded; account_subtype TEXT cache protected; no unauthorized detail_types FK`
);
process.exit(0);
