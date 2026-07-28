#!/usr/bin/env node
/**
 * verify-parts-purchase-postings-failclosed (KR-01 / MNT-ECON-01)
 *
 * LIVE (GUARD 2026-07-27): to_regclass('accounting.parts_purchase_postings') = NULL.
 * Poster is flag-gated (latent) but flipping PARTS_PURCHASE_GL_POSTING_ENABLED before the
 * HELD mig 202609030000 applies = 42P01 on a money path. Fail-closed to_regclass BEFORE any
 * SELECT/INSERT on the latch. Not an allowlist — KNOWN_RED shrinks when the mig is applied.
 *
 * Usage: node scripts/verify-parts-purchase-postings-failclosed.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SRC = "apps/backend/src/accounting/parts-inventory-posting/poster.service.ts";

export function assertFailClosed(src) {
  const problems = [];
  const firstUse = Math.min(
    ...["FROM accounting.parts_purchase_postings", "INSERT INTO accounting.parts_purchase_postings"]
      .map((s) => {
        const i = src.indexOf(s);
        return i < 0 ? Number.POSITIVE_INFINITY : i;
      })
      .filter((i) => Number.isFinite(i))
  );
  if (!Number.isFinite(firstUse)) {
    problems.push("no parts_purchase_postings read/write found — update path if poster moved");
    return problems;
  }
  const before = src.slice(0, firstUse);
  if (!/to_regclass\s*\(/.test(before) || !before.includes("accounting.parts_purchase_postings")) {
    problems.push("no to_regclass('accounting.parts_purchase_postings') before latch SELECT/INSERT");
  }
  if (!/latch_table_missing|E_PARTS_PURCHASE_SCHEMA_NOT_APPLIED/.test(before)) {
    problems.push("missing latch_table_missing / E_PARTS_PURCHASE_SCHEMA_NOT_APPLIED fail-closed reason");
  }
  if (!/202609030000/.test(before)) {
    problems.push("fail-closed path must name migration 202609030000");
  }
  return problems;
}

function run() {
  const abs = resolve(process.cwd(), SRC);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${SRC} missing`);
    return false;
  }
  const problems = assertFailClosed(readFileSync(abs, "utf8"));
  if (problems.length) {
    console.error(`[verify-parts-purchase-postings-failclosed] FAILED — ${problems.length}:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log("[verify-parts-purchase-postings-failclosed] OK — latch probed before use");
  return true;
}

function selftest() {
  const good = `
    SELECT to_regclass($1::text) IS NOT NULL AS ok ["accounting.parts_purchase_postings"]
    latch_table_missing E_PARTS_PURCHASE_SCHEMA_NOT_APPLIED 202609030000
    FROM accounting.parts_purchase_postings
  `;
  const bad = `FROM accounting.parts_purchase_postings WHERE id = $1`;
  if (assertFailClosed(good).length || !assertFailClosed(bad).length) {
    console.error("SELFTEST FAIL");
    process.exit(1);
  }
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
