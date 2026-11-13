#!/usr/bin/env node
// ACCT-F11100 — QuickBooks bank-feed parity: a PENDING bank-feed line is never counted, and a posted line
// replaces its pending (both generations of it) instead of becoming a second line.
//
// Measured on prod USMCA 11-04 (USMCA FREIGHT): the Banking money-map counted live pending lines beside their
// posted twins — Oct out $285,153.62 vs $284,129.85 cleared; Nov 1-3 out $41,194.89 vs $19,199.76 cleared. Root
// cause of the twins: BofA re-issues a pending once before it posts and Plaid sends no `removed` for the first
// generation; the ingest retired only the pending named by pending_transaction_id.
//
// RULE 1 — cleared-bank-line.sql.ts defines clearedBankLine (voided, merged, pending, sample all excluded) and
//          pendingBankLine (same, pending = true).
// RULE 2 — every Banking total / balance / register / review reader and the cash pulse call clearedBankLine(.
// RULE 3 — the money-map lists pending separately (pendingBankLine + pending_lines) and carries no raw
//          voided-only filter that would let a pending line into the tiles.
// RULE 4 — retirePlaidPendingPredecessor calls retireOrphanPendingGenerations; the orphan SQL voids with
//          merged_into, never DELETEs, never touches a financially linked row, one per posted line.
// RULE 5 — the Plaid ingest calls retirePlaidPendingPredecessor on every inserted posted row.
// RULE 6 — ROW 99+113: the Plaid ingest retires the older pending generation the moment a pending is RE-ISSUED
//          (retireOlderPendingGenerationOnReissue on an inserted pending row), using the same selection SQL.
import fs from "node:fs";

const PRED = "apps/backend/src/banking/cleared-bank-line.sql.ts";
const DEDUP = "apps/backend/src/banking/bank-tx-dedup.ts";
const MONEY_MAP = "apps/backend/src/banking/money-map.routes.ts";
const PLAID = "apps/backend/src/integrations/plaid/plaid.service.ts";
const READERS = [
  MONEY_MAP,
  "apps/backend/src/banking/pending-categorization.ts",
  "apps/backend/src/banking/banking-kpi.service.ts",
  "apps/backend/src/banking/bank-tieout.service.ts",
  "apps/backend/src/banking/internal-wallet-balance.ts",
  "apps/backend/src/banking/banking.routes.ts",
  "apps/backend/src/integrations/plaid/link.routes.ts",
  PLAID,
  "apps/backend/src/cash-flow/cash-flow-bank-actuals.sql.ts",
];

function fnBody(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) return "";
  const end = src.indexOf("\n}", i);
  return src.slice(i, end < 0 ? src.length : end + 2);
}

export function audit(files) {
  const out = [];
  const pred = files[PRED];
  if (pred == null) return [`RULE 1: ${PRED} is missing`];
  const cleared = fnBody(pred, "export function clearedBankLine");
  const pending = fnBody(pred, "export function pendingBankLine");
  const live = fnBody(pred, "function liveRealBankLine");
  if (!cleared || !pending || !live) out.push("RULE 1: clearedBankLine / pendingBankLine / liveRealBankLine not found");
  for (const [re, label] of [
    [/voided_at IS NULL/, "voided_at IS NULL"],
    [/merged_into_bank_transaction_id IS NULL/, "merged_into_bank_transaction_id IS NULL"],
    [/is_sample_data, false\) = false/, "is_sample_data excluded"],
  ]) {
    if (!re.test(live)) out.push(`RULE 1: the shared live-line clause lost ${label}`);
  }
  if (!/pending, false\) = false/.test(cleared)) out.push("RULE 1: clearedBankLine no longer excludes pending lines");
  if (!/pending, false\) = true/.test(pending)) out.push("RULE 1: pendingBankLine no longer selects pending lines only");
  if (!/liveRealBankLine\(/.test(cleared) || !/liveRealBankLine\(/.test(pending)) out.push("RULE 1: cleared/pending must share liveRealBankLine");

  for (const r of READERS) {
    const s = files[r];
    if (s == null) {
      out.push(`RULE 2: ${r} is missing`);
      continue;
    }
    if (!/clearedBankLine\(/.test(s)) out.push(`RULE 2: ${r} does not read clearedBankLine() — a pending line can be counted there`);
  }

  const review = fnBody(files["apps/backend/src/banking/pending-categorization.ts"] ?? "", "export function pendingCategorizationPredicate");
  if (!/clearedBankLine\(/.test(review)) out.push("RULE 2: For Review (pendingCategorizationPredicate) offers pending bank-feed lines");

  const mm = files[MONEY_MAP] ?? "";
  if (!/pendingBankLine\(/.test(mm) || !/pending_lines:\s*\w+/.test(mm)) out.push("RULE 3: money-map no longer returns the separate Pending list");
  if (/AND bt\.voided_at IS NULL\s*\n\s*AND bt\.is_sample_data IS NOT TRUE/.test(mm)) out.push("RULE 3: money-map carries a raw voided-only filter (pending lines counted)");
  const txStats = mm.slice(mm.indexOf("tx_stats AS ("), mm.indexOf("bank_pending AS ("));
  if (!/clearedBankLine\("bt"\)/.test(txStats)) out.push("RULE 3: the money in/out aggregate (tx_stats) does not read clearedBankLine");

  const dd = files[DEDUP] ?? "";
  const retire = fnBody(dd, "export async function retirePlaidPendingPredecessor");
  if (!/retireOrphanPendingGenerations\(/.test(retire)) out.push("RULE 4: retirePlaidPendingPredecessor no longer retires the older pending generation");
  // ROW 99+113: the selection SQL lives in orphanPendingGenerationSql(reason); both retirements are built from it.
  const sqlStart = dd.indexOf("export function orphanPendingGenerationSql");
  const sql = sqlStart < 0 ? "" : dd.slice(sqlStart, dd.indexOf("RETURNING t.id", sqlStart) + 14);
  if (!sql || !/export const RETIRE_ORPHAN_PENDING_GENERATION_SQL = orphanPendingGenerationSql\("replaced_by_plaid_posted:"\)/.test(dd)) out.push("RULE 4: RETIRE_ORPHAN_PENDING_GENERATION_SQL is missing");
  else {
    if (/DELETE\s+FROM/i.test(sql)) out.push("RULE 4: the orphan retirement DELETEs a bank line (void, never delete)");
    for (const need of [
      "merged_into_bank_transaction_id = $2::uuid",
      "o.pending = true",
      "o.matched_journal_entry_id IS NULL",
      "o.reconciled_obligation_id IS NULL",
      "o.categorization_gl_account_id IS NULL",
      "o.amount_cents = r.amount_cents",
      "o.is_credit = r.is_credit",
      "o.created_at < r.created_at",
      "LIMIT 1",
    ]) {
      if (!sql.includes(need)) out.push(`RULE 4: orphan retirement SQL lost '${need}'`);
    }
  }

  const pl = files[PLAID] ?? "";
  const ingest = pl.slice(pl.indexOf("for (const transaction of syncRes.data.added)"), pl.indexOf("for (const transaction of syncRes.data.modified)"));
  if (!/retirePlaidPendingPredecessor\(/.test(ingest)) out.push("RULE 5: the Plaid ingest no longer retires the pending a posted line replaces");
  if (!/if \(transaction\.pending\) \{\s+await retireOlderPendingGenerationOnReissue\(client, \{/.test(ingest)) out.push("RULE 6: the Plaid ingest no longer retires the older pending generation when a pending is re-issued");
  if (!/export const RETIRE_PENDING_GENERATION_ON_REISSUE_SQL = orphanPendingGenerationSql\("replaced_by_plaid_pending_reissue:"\)/.test(dd)) out.push("RULE 6: the re-issue retirement does not use the shared selection SQL");
  return out;
}

function load(root) {
  const files = {};
  for (const r of [PRED, DEDUP, ...READERS]) {
    try {
      files[r] = fs.readFileSync(`${root}/${r}`, "utf8");
    } catch {
      files[r] = null;
    }
  }
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const cases = [
    ["cleared lets pending in", plant(PRED, "COALESCE(${a}.pending, false) = false)", "true)")],
    ["merged copies counted", plant(PRED, "AND ${a}.merged_into_bank_transaction_id IS NULL", "")],
    ["cash pulse drops the predicate", plant("apps/backend/src/cash-flow/cash-flow-bank-actuals.sql.ts", 'AND ${clearedBankLine("bt")}', "AND bt.voided_at IS NULL")],
    ["money-map tiles count pending", plant(MONEY_MAP, 'AND ${clearedBankLine("bt")}\n              ${dateWhere}\n            GROUP BY bt.bank_account_id\n          ),\n          bank_pending', 'AND bt.voided_at IS NULL\n              ${dateWhere}\n            GROUP BY bt.bank_account_id\n          ),\n          bank_pending')],
    ["pending list removed", plant(MONEY_MAP, "pending_lines: pendingRes.rows", "pl: pendingRes.rows")],
    ["orphan generation not retired", plant(DEDUP, "const orphans = await retireOrphanPendingGenerations(client, {", "const orphans = await Promise.resolve([] as string[]) && ({")],
    ["orphan SQL touches linked rows", plant(DEDUP, "       AND o.categorization_gl_account_id IS NULL\n", "")],
    ["orphan SQL deletes", plant(DEDUP, "  UPDATE banking.bank_transactions t\n     SET voided_at = now(),", "  DELETE FROM banking.bank_transactions t\n     SET voided_at = now(),")],
    ["re-issue retirement unwired", plant(PLAID, "await retireOlderPendingGenerationOnReissue(client, {", "await Promise.resolve({")],
    ["re-issue SQL forked", plant(DEDUP, 'orphanPendingGenerationSql("replaced_by_plaid_pending_reissue:")', '"SELECT 1"')],
    ["For Review reader dropped", plant("apps/backend/src/banking/pending-categorization.ts", "AND ${clearedBankLine(alias)} AND", "AND")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-pending-bank-lines-never-counted: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-pending-bank-lines-never-counted FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-pending-bank-lines-never-counted: PASS — ${READERS.length} readers on clearedBankLine, Pending listed apart, posted line retires both pending generations`);
