#!/usr/bin/env node
// GUARD — verify-je-memo-is-human-readable (ROUND E14.2, task 45, DEVIN-B)
//
// A journal-entry memo is the ONE human-readable line an operator sees on a JE register row. The
// posting engine (apps/backend/src/accounting/posting-engine.service.ts) builds each memo from a
// real document identity (bill number, invoice display_id, expense_number, etc.) — never a raw uuid
// (that class is caught by verify-je-memo-not-bare-uuid.mjs). This guard catches the FOUR remaining
// shapes that make a memo NOT human-readable, any one of which is a FAIL:
//
//   1. SERIALIZED JSON — a memo that is a JSON blob ({"key":"value",...} or [{...}]) instead of a
//      sentence. The writer serialized the source row into the memo instead of building a label.
//   2. OVER 200 CHARS — a memo so long it stops being a label and becomes a dump. 200 is the ceiling
//      the owner's own UI standard implies (a register row memo is one line, not a paragraph).
//   3. NO DOCUMENT REFERENCE — the JE has no journal_entry_postings.source_transaction_type at all,
//      meaning it is linked to no source document. The memo is the label; the linkage is the
//      reference. A JE with neither is an orphan with an unresolvable memo.
//   4. BARE UUID ONLY — the memo contains a UUID but NO human-resolvable identifier (load number
//      134xx, settlement 57xx/58xx, Faro invoice, driver name, vendor name, unit Txxx). A bare UUID
//      is machine-only; an operator cannot resolve it. A UUID ALONGSIDE one of those is fine.
//      RED fixture: "Fuel event 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf (diesel..." — has a UUID but
//      no load number, settlement, invoice, driver, vendor, or unit.
//   5. EMPTY — memo IS NULL or whitespace-only. No label at all.
//
// BASELINE 0 (shrink-only): USMCA journal entries are near-zero today, so the expected violation
// count is 0. Any violation fails the guard. --write-baseline is FORBIDDEN — the baseline is 0 by
// population, not by snapshot. EMPTY-BY-PURGE: if a purge window is open and the JE table is empty,
// 0 violations is the correct answer (not a skip); the guard passes with 0.
//
// LIVE guard (REQUIRES_LIVE_DB): touches money-relevant data (journal entries). Uses
// requireLiveDbOrExit and declares REQUIRES_LIVE_DB so verify-static.mjs's no-DB sweep excludes it.
// Wired into money-pr-local-gate.mjs LIVE_DOMAIN_GUARDS so it runs when a diff touches the posting
// paths that write JEs, and fails closed when no DATABASE_URL is available.
//
// COORDINATION (ROUND E14.2): CC-2 is fixing the WRITER (posting-engine.service.ts memo builders)
// in the same round. This guard catches the output; CC-2 fixes the input. Neither does both.
// Communicate through OUTBOX-DEVIN-B.md.
//
// Self-test: node scripts/verify-je-memo-is-human-readable.mjs --selftest
export const REQUIRES_LIVE_DB = "money-relevant (journal entry memos) — must fail-closed, never skip, per ROUND 29.9-B";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-je-memo-is-human-readable";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const MEMO_MAX_CHARS = 200;

// Human-resolvable identifier patterns. A memo must contain at least ONE of these
// to be considered "human-readable." A bare UUID without any of these is machine-only.
//   - Load number: 134xx (5+ digits starting with 13)
//   - Settlement number: 57xx or 58xx (4+ digits starting with 57 or 58)
//   - Faro invoice number: INV- prefix or similar invoice identifier
//   - Driver name: a capitalized word (at least 2 chars) that is NOT a UUID
//   - Vendor name: a capitalized word (at least 2 chars) that is NOT a UUID
//   - Unit number: Txxx (T followed by digits)
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LOAD_NUM_RE = /\b1[3-9]\d{3,}\b/; // 134xx, 135xx, etc. (5+ digits starting with 13-19)
const SETTLEMENT_NUM_RE = /\b5[78]\d{2,}\b/; // 57xx, 58xx (4+ digits starting with 57 or 58)
const INVOICE_RE = /\b(?:INV|FARO|invoice)\s*[-#]?\s*\d/i;
const UNIT_RE = /\bT\d{2,}\b/i; // Txxx unit number
// A "name" is a word of 3+ alpha chars that is NOT part of a UUID and NOT a common machine word.
// We strip UUIDs first, then look for any remaining word of 3+ alpha characters.
const MACHINE_WORDS = new Set(["fuel", "event", "diesel", "posting", "payment", "advance", "settlement", "invoice", "bill", "expense", "load", "void", "reversal", "debit", "credit", "journal", "entry", "memo", "null", "true", "false", "type", "id", "uuid", "ref", "transaction", "source"]);

function hasHumanReadableId(memo) {
  const s = String(memo);
  // Check for explicit identifiers first
  if (LOAD_NUM_RE.test(s)) return true;
  if (SETTLEMENT_NUM_RE.test(s)) return true;
  if (INVOICE_RE.test(s)) return true;
  if (UNIT_RE.test(s)) return true;
  // Strip UUIDs, then look for any remaining word of 3+ alpha characters that
  // is NOT a common machine word. A driver name or vendor name would survive.
  const withoutUuids = s.replace(UUID_RE, " ");
  const words = withoutUuids.match(/[a-zA-Z]{3,}/g) ?? [];
  for (const w of words) {
    if (!MACHINE_WORDS.has(w.toLowerCase())) return true;
  }
  return false;
}

/**
 * Classify a single JE memo + its document-reference state into a violation kind, or null if clean.
 * Pure function — exported for selftest.
 * @param {{ memo: string | null, has_source: boolean }} row
 * @returns {string | null} violation kind, or null if the row is clean
 */
export function classifyMemo(row) {
  const memo = row.memo;
  if (memo == null || String(memo).trim() === "") return "empty_memo";
  const s = String(memo);
  // Serialized JSON: starts with { or [ — no human-readable memo starts with those characters.
  if (/^\s*[\[{]/.test(s)) return "serialized_json";
  if (s.length > MEMO_MAX_CHARS) return "memo_over_200_chars";
  if (!row.has_source) return "no_document_reference";
  // Bare UUID only: the memo has a UUID but NO human-resolvable identifier.
  // A UUID alongside a load number, settlement, invoice, driver name, vendor name, or unit is fine.
  if (UUID_RE.test(s) && !hasHumanReadableId(s)) return "bare_uuid_only";
  return null;
}

/**
 * Query all USMCA posted journal entries with their memo and document-reference flag.
 * Runs inside a transaction with bypass_rls='lucia' (USMCA scope only).
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Array<{ id: string, memo: string | null, has_source: boolean }>>}
 */
async function measure(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
  const res = await client.query(
    `SELECT je.id::text AS id,
            je.memo,
            EXISTS (
              SELECT 1 FROM accounting.journal_entry_postings jep
               WHERE jep.journal_entry_uuid = je.id
                 AND jep.source_transaction_type IS NOT NULL
            ) AS has_source
       FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1::uuid
        AND je.status = 'posted'
        AND je.is_sample_data IS NOT TRUE
      ORDER BY je.created_at`,
    [USMCA_COMPANY_ID],
  );
  await client.query("ROLLBACK");
  return res.rows;
}

function runClassifierSelftest() {
  const fixtures = [
    { row: { memo: null, has_source: true }, expect: "empty_memo" },
    { row: { memo: "   ", has_source: true }, expect: "empty_memo" },
    { row: { memo: '{"bill_id":"abc","amount":100}', has_source: true }, expect: "serialized_json" },
    { row: { memo: '[{"id":"x"}]', has_source: true }, expect: "serialized_json" },
    { row: { memo: "x".repeat(201), has_source: true }, expect: "memo_over_200_chars" },
    { row: { memo: "Bill payment B-12225 posting", has_source: false }, expect: "no_document_reference" },
    { row: { memo: "Bill payment B-12225 posting", has_source: true }, expect: null },
    { row: { memo: "Fuel txn posting", has_source: true }, expect: null },
    // E22 addendum: bare UUID is NOT a document reference
    { row: { memo: "Fuel event 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf (diesel...", has_source: true }, expect: "bare_uuid_only" },
    // UUID alongside a load number is fine
    { row: { memo: "Load 13508 fuel event 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf", has_source: true }, expect: null },
    // UUID alongside a unit number is fine
    { row: { memo: "Unit T123 fuel 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf", has_source: true }, expect: null },
    // UUID alongside a driver name is fine
    { row: { memo: "Carlos Galaviz fuel 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf", has_source: true }, expect: null },
  ];
  let fixtureFail = 0;
  for (const { row, expect: exp } of fixtures) {
    const got = classifyMemo(row);
    if (got !== exp) {
      console.error(`${LABEL} --selftest FAIL — fixture memo=${JSON.stringify(row.memo)} has_source=${row.has_source}: expected ${exp}, got ${got}`);
      fixtureFail += 1;
    }
  }
  if (fixtureFail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${fixtures.length} classifier fixtures all correct`);
  }
}

async function run({ selftest }) {
  // Selftest: classifier fixtures run WITHOUT a DB (the classifier is a pure function).
  // If DATABASE_URL is available, also run the live measurement and report the count.
  if (selftest) {
    runClassifierSelftest();
    if (process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL) {
      const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
      try {
        const rows = await measure(client);
        const violations = rows.filter((r) => classifyMemo(r) !== null);
        const byKind = new Map();
        for (const r of rows) {
          const k = classifyMemo(r);
          if (k) byKind.set(k, (byKind.get(k) ?? 0) + 1);
        }
        console.log(
          `${LABEL} --selftest LIVE — scanned ${rows.length} posted JE(s) for USMCA, ` +
            `${violations.length} violation(s): ${[...byKind.entries()].map(([k, n]) => `${k}=${n}`).join(", ") || "none"}`,
        );
      } finally {
        client.release();
        await pool.end();
      }
    }
    return;
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const rows = await measure(client);
    const violations = [];
    const byKind = new Map();
    for (const row of rows) {
      const kind = classifyMemo(row);
      if (kind) {
        violations.push({ id: row.id, kind, memo_preview: String(row.memo ?? "").slice(0, 80) });
        byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      }
    }

    if (violations.length > 0) {
      const summary = [...byKind.entries()].map(([k, n]) => `${k}=${n}`).join(", ");
      const sample = violations.slice(0, 10).map((v) => `  ${v.id} [${v.kind}] memo="${v.memo_preview}..."`).join("\n");
      console.error(
        `${LABEL}: LIVE FAIL — ${violations.length} USMCA posted JE memo(s) are not human-readable (${summary}).\n` +
          `Baseline is 0 (shrink-only). First ${Math.min(10, violations.length)}:\n${sample}\n` +
          `CC-2 is fixing the WRITER in this round (ROUND E14.2) — coordinate via OUTBOX-DEVIN-B.md.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: LIVE PASS — ${rows.length} USMCA posted JE(s) scanned, 0 non-human-readable memo(s). Baseline 0 held.`);
  } finally {
    client.release();
    await pool.end();
  }
}

await run({ selftest: process.argv.includes("--selftest") });
