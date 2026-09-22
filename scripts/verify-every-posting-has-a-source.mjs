#!/usr/bin/env node
// verify-every-posting-has-a-source.mjs — every accounting.journal_entry_postings row names the document it
// posts for (source_transaction_type AND source_transaction_id).
//
// Lead round 53, E1: accounting/journal-entries.service.ts wrote every line with no source at all; its
// automated callers (source="auto") produced 440 unsourced rows, $851,668.81, measured 2026-09-22 across all
// USMCA rows (361 / $762,612.39 of them on live entries). The writer now refuses an automated entry that is
// still unsourced after afterInsertBeforeCommit, and makes a hand-keyed entry its own source ("manual_je").
//
// Two arms:
//   CODE  the writer still carries its refusal — deleting it fails this guard with or without a database.
//   LIVE  shrink-only ceiling on unsourced USMCA posting rows (all rows, live or reversed — a reversing line
//         copied from an unsourced original is itself unsourced). Grew -> FAIL. Shrank -> PASS, prints the
//         tighter number to commit to the baseline.
//
// Fail-closed (ROUND 29.9-B): no DATABASE_URL, or no connection, is a FAIL.
// POSTING_SOURCE_BASELINE_PATH overrides the baseline location (red-run proof only).
import fs from "node:fs";
import path from "node:path";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-every-posting-has-a-source";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WRITER = path.join(ROOT, "apps/backend/src/accounting/journal-entries.service.ts");
const BASELINE_PATH =
  process.env.POSTING_SOURCE_BASELINE_PATH || path.join(ROOT, "scripts/verify-every-posting-has-a-source.baseline.json");

const fail = (msg) => {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
};

const writer = fs.readFileSync(WRITER, "utf8");
for (const token of [
  "journal_entry_posting_source_required",
  "journal_entry_posting_source_pair_incomplete",
  "source_transaction_type IS NULL OR source_transaction_id IS NULL",
]) {
  if (!writer.includes(token)) {
    fail(`${path.relative(ROOT, WRITER)} no longer contains "${token}" — the writer must refuse an unsourced posting`);
  }
}

if (!fs.existsSync(BASELINE_PATH)) fail(`baseline not found at ${path.relative(ROOT, BASELINE_PATH)}`);
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
if (!Number.isInteger(baseline.unsourced_postings) || baseline.unsourced_postings < 0) {
  fail("baseline field unsourced_postings missing or not a non-negative integer");
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const res = await client.query(
    `SELECT count(*)::int AS n, coalesce(sum(p.amount_cents), 0)::bigint AS cents
       FROM accounting.journal_entry_postings p
      WHERE p.operating_company_id = $1::uuid
        AND (p.source_transaction_type IS NULL OR p.source_transaction_id IS NULL)`,
    [USMCA_COMPANY_ID]
  );
  const n = res.rows[0].n;
  const usd = (Number(res.rows[0].cents) / 100).toFixed(2);
  if (n > baseline.unsourced_postings) {
    const newest = await client.query(
      `SELECT p.id::text, p.created_at::text, left(je.memo, 80) AS memo, je.source
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
        WHERE p.operating_company_id = $1::uuid
          AND (p.source_transaction_type IS NULL OR p.source_transaction_id IS NULL)
        ORDER BY p.created_at DESC LIMIT 10`,
      [USMCA_COMPANY_ID]
    );
    await client.query("ROLLBACK");
    console.error(`${LABEL}: LIVE FAIL — unsourced postings grew: ${n} > baseline ${baseline.unsourced_postings} ($${usd})`);
    for (const r of newest.rows) console.error(`  ✗ ${r.id} ${r.created_at} source=${r.source} "${r.memo}"`);
    process.exit(1);
  }
  await client.query("COMMIT");
  if (n < baseline.unsourced_postings) {
    console.log(`${LABEL}: unsourced postings shrank ${baseline.unsourced_postings} -> ${n}; commit ${n} to ${path.relative(ROOT, BASELINE_PATH)}`);
  }
  console.log(`${LABEL}: PASS — writer refuses unsourced postings; ${n} unsourced USMCA posting rows ($${usd}) <= baseline ${baseline.unsourced_postings}.`);
} finally {
  client.release();
  await pool.end();
}
