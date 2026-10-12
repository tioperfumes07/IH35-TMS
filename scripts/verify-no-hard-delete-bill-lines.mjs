#!/usr/bin/env node
/**
 * verify-no-hard-delete-bill-lines.mjs (F9-02)
 *
 * Tripwire: production code must never hard-DELETE accounting.bill_lines.
 * Orphan QBO lines are voided (voided_at) and money-path reads exclude voided rows.
 *
 * --selftest plants a DELETE in a temp tree and proves RED.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-hard-delete-bill-lines";

const PULLER = "apps/backend/src/qbo-sync/ap-bills-puller.ts";
const MIG = "db/migrations/202609010040_f9_02_bill_lines_void_not_delete.sql";

const DELETE_RE = /DELETE\s+FROM\s+accounting\.bill_lines\b/i;
const EXCLUDE_DIR_RE = /(\/__tests__\/|\/tests\/|\.test\.|\.spec\.|e2e-)/i;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else if (/\.(ts|js|mjs|cjs)$/.test(ent.name)) out.push(abs);
  }
  return out;
}

export function assertNoHardDeleteBillLines(opts = {}) {
  const root = opts.root ?? ROOT;
  const failures = [];

  const migAbs = path.join(root, MIG);
  if (!fs.existsSync(migAbs)) {
    failures.push(`missing ${MIG}`);
  } else {
    const sql = fs.readFileSync(migAbs, "utf8");
    if (!/DO NOT RUN ON PROD/i.test(sql)) {
      failures.push(`${MIG} must carry DO NOT RUN ON PROD marker`);
    }
    if (!/ADD COLUMN IF NOT EXISTS voided_at/i.test(sql)) {
      failures.push(`${MIG} must ADD COLUMN voided_at`);
    }
    if (!/ADD COLUMN IF NOT EXISTS voided_reason/i.test(sql)) {
      failures.push(`${MIG} must ADD COLUMN voided_reason`);
    }
  }

  const pullerAbs = path.join(root, PULLER);
  if (!fs.existsSync(pullerAbs)) {
    failures.push(`missing ${PULLER}`);
  } else {
    const src = fs.readFileSync(pullerAbs, "utf8");
    if (DELETE_RE.test(src)) {
      failures.push(`${PULLER} must not DELETE FROM accounting.bill_lines`);
    }
    // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: the puller's QBO orphan-line path had to UPDATE voided_at
    // (COALESCE(bl.voided_at, now())), stamp voided_reason 'qbo_orphan_superseded', and exclude voided lines
    // from the header/line sum check. NEW: QuickBooks is a read-only archive — the bill_lines projection (and
    // with it the orphan path) was REMOVED; projectApBillLinesToLedger() refuses by name. The puller must now
    // write NO accounting.bill_lines row at all (no INSERT / UPDATE / DELETE), which subsumes void-not-delete
    // for this file. The repo-wide hard-DELETE ban below is unchanged.
    // WHY: a QBO path never writes a native money table.
    if (/(?:INSERT\s+INTO|UPDATE)\s+accounting\.bill_lines\b/i.test(src)) {
      failures.push(`${PULLER} writes accounting.bill_lines — the QBO -> native line projection was removed (ACCT-F4431380)`);
    }
    if (!/refuseQboNativeWrite\(/.test(src)) {
      failures.push(`${PULLER} must refuse the removed line projection by name (refuseQboNativeWrite)`);
    }
  }

  const srcRoot = path.join(root, "apps/backend/src");
  if (fs.existsSync(srcRoot)) {
    for (const file of walk(srcRoot)) {
      const rel = path.relative(root, file);
      if (EXCLUDE_DIR_RE.test(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (DELETE_RE.test(text)) {
        failures.push(`${rel}: hard DELETE FROM accounting.bill_lines forbidden outside tests`);
      }
    }
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f9-02-bill-lines-"));
  const tmpPullerDir = path.join(tmp, "apps/backend/src/qbo-sync");
  const tmpMigDir = path.join(tmp, "db/migrations");
  fs.mkdirSync(tmpPullerDir, { recursive: true });
  fs.mkdirSync(tmpMigDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpMigDir, "202609010040_f9_02_bill_lines_void_not_delete.sql"),
    "-- DO NOT RUN ON PROD\nALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS voided_at timestamptz;\nALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS voided_reason text;\n"
  );
  fs.writeFileSync(
    path.join(tmpPullerDir, "ap-bills-puller.ts"),
    `DELETE FROM accounting.bill_lines bl USING accounting.bills b WHERE 1=1;\n`
  );
  const planted = assertNoHardDeleteBillLines({ root: tmp });
  if (planted.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAIL — planted DELETE was not caught`);
    process.exit(1);
  }
  // ACCT-F4431380 (9e): the REAL puller copied into the temp tree must pass the puller checks, and the same
  // copy with the old orphan-void UPDATE re-planted must fail.
  const realPuller = fs.readFileSync(path.join(ROOT, PULLER), "utf8");
  fs.writeFileSync(path.join(tmpPullerDir, "ap-bills-puller.ts"), realPuller);
  const clean = assertNoHardDeleteBillLines({ root: tmp }).filter((f) => f.includes(PULLER));
  fs.writeFileSync(
    path.join(tmpPullerDir, "ap-bills-puller.ts"),
    realPuller + "\nconst PLANT = `UPDATE accounting.bill_lines bl SET voided_at = COALESCE(bl.voided_at, now())`;\n"
  );
  const replanted = assertNoHardDeleteBillLines({ root: tmp }).filter((f) => f.includes(PULLER));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (clean.length !== 0 || replanted.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAIL — real puller clean=${JSON.stringify(clean)} replanted=${replanted.length}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] SELFTEST PASS — planted DELETE caught (${planted.length} failure(s)); real puller clean; re-planted native line UPDATE caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = assertNoHardDeleteBillLines();
  if (failures.length) {
    console.error(`[${LABEL}] FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — no hard DELETE of accounting.bill_lines; QBO puller writes no bill_lines (ACCT-F4431380 refusal) + void migration present`);
}

main();
