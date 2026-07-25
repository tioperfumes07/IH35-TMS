#!/usr/bin/env node
/**
 * GUARD (LST-F04): the cancel-load writer must persist the CANONICAL per-entity reason link.
 *
 * ROOT CAUSE it exists for — verified on prod br-fancy-credit-akjnd07a 2026-07-24:
 *   dispatch.load_cancellations carried BOTH reason FKs. `reason_code` was NOT NULL with an FK to
 *   catalogs.cancellation_reasons (the RETIRE table, 9 global rows, RLS OFF), while
 *   cancellation.service.ts read the CANONICAL per-entity catalogs.load_cancellation_reasons and
 *   wrote only that text. All 12 active per-entity codes (36 rows / 3 entities) are absent from the
 *   legacy 9-row set, so a cancel using any code the UI shows violated a NOT-NULL-backed FK.
 *
 * This guard asserts the SUBSTANCE (the canonical id is actually selected and inserted), not the
 * shape (that the file mentions the table) — see docs/trackers/GUARD-SHAPE-VS-SUBSTANCE-REGISTER.md.
 *
 * Usage: node scripts/verify-cancel-load-canonical-reason-fk.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/dispatch/cancellation.service.ts";
const LABEL = "verify-cancel-load-canonical-reason-fk";

/** Assertions run against the real service source. */
export function assertCancelWriter(source) {
  const problems = [];

  // 1. The catalog lookup must select the row id — without it there is nothing canonical to write.
  const selectsId = /SELECT\s+id\s*,[\s\S]{0,200}?FROM\s+catalogs\.load_cancellation_reasons/i.test(source);
  if (!selectsId) {
    problems.push(
      `${SERVICE}: the catalogs.load_cancellation_reasons lookup does not SELECT id. ` +
        `Without the id the writer cannot set reason_code_id (the canonical FK).`
    );
  }

  // 2. The INSERT column list must include reason_code_id.
  const insertBlock = source.match(/INSERT INTO dispatch\.load_cancellations\s*\(([\s\S]*?)\)/i);
  if (!insertBlock) {
    problems.push(`${SERVICE}: no INSERT INTO dispatch.load_cancellations found — did the writer move?`);
  } else if (!/\breason_code_id\b/.test(insertBlock[1])) {
    problems.push(
      `${SERVICE}: INSERT INTO dispatch.load_cancellations does not write reason_code_id. ` +
        `The canonical per-entity FK must be persisted, not just the legacy reason_code text.`
    );
  }

  // 3. An upsert that refreshes reason_code must refresh reason_code_id too, or an edited
  //    cancellation silently keeps a stale canonical link.
  if (/ON CONFLICT[\s\S]{0,400}?SET[\s\S]{0,400}?reason_code\s*=\s*EXCLUDED\.reason_code/i.test(source)
      && !/ON CONFLICT[\s\S]{0,600}?reason_code_id\s*=\s*EXCLUDED\.reason_code_id/i.test(source)) {
    problems.push(
      `${SERVICE}: the ON CONFLICT DO UPDATE refreshes reason_code but not reason_code_id — ` +
        `re-cancelling a load would leave a stale canonical link.`
    );
  }

  // 4. The writer must not depend on the RETIRE table — in CODE. Comments legitimately name it to
  //    explain the migration, so strip comments first; otherwise the guard flags its own rationale
  //    (the selftest caught exactly that false positive).
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|--)/.test(l))
    .join("\n");
  if (/catalogs\.cancellation_reasons\b/.test(code)) {
    problems.push(
      `${SERVICE}: references catalogs.cancellation_reasons, the RETIRE table (LINKAGE LAW). ` +
        `The canonical home is catalogs.load_cancellation_reasons.`
    );
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const failures = [];
  // Mutate the REAL source, one case per assertion. A selftest over inline literals proves nothing.
  const real = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");

  const mutate = (name, fn, needle) => {
    const mutated = fn(real);
    if (mutated === real) {
      failures.push(`${name}: mutation did not change the source — the case is INERT, fix the mutation`);
      return;
    }
    if (!assertCancelWriter(mutated).some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (expected "${needle}")`);
    }
  };

  mutate("drops-id-from-select", (s) => s.replace(/SELECT\s+id\s*,\s*reason_code/i, "SELECT reason_code"), "does not SELECT id");
  mutate("drops-reason_code_id-from-insert",
    (s) => s.replace(/operating_company_id, load_id, reason_code, reason_code_id,/, "operating_company_id, load_id, reason_code,"),
    "does not write reason_code_id");
  mutate("stale-upsert",
    (s) => s.replace(/\n\s*reason_code_id = EXCLUDED\.reason_code_id,/, ""),
    "stale canonical link");
  mutate("uses-retire-table",
    (s) => s.replace(/FROM catalogs\.load_cancellation_reasons/i, "FROM catalogs.cancellation_reasons"),
    "RETIRE table");

  // The corrected shape must NOT be flagged.
  const clean = assertCancelWriter(real);
  if (clean.length) failures.push(`false positive on the fixed source: ${clean.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 defects planted in the REAL source were caught; fixed source not flagged`);
  process.exit(0);
}

if (IS_MAIN) {
  const abs = path.join(ROOT, SERVICE);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAILED — ${SERVICE} is missing`);
    process.exit(1);
  }
  const problems = assertCancelWriter(fs.readFileSync(abs, "utf8"));
  if (problems.length) {
    console.error(`${LABEL} FAILED — cancel-load does not persist the canonical reason link:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — cancel-load selects and persists reason_code_id; no RETIRE-table dependency`);
}
