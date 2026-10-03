#!/usr/bin/env node
/**
 * ROUND 368.2(b) — FAILS IF a code path can make a document stop being live while a bank line still names it.
 * 202615360600 (CC-2) refuses that at COMMIT; it was disarmed (202615360700) because void paths did not release the
 * lines that name their document, and re-armed by 202615360930 once every one did (fork rehearsal in that file).
 *   static — every UPDATE in apps/backend/src that kills one of the 13 documents a bank line can name (voided_at /
 *            revoked_at / soft_deleted_at / reversed_by_je_id / status='void') sits in a function that releases first:
 *            releaseBankLinesNamingDocument, unmatchBankTransactionsForVoid (via postVoidReversal), stampDocumentVoided,
 *            releaseBankLineMatches(Where), or a void primitive that does (voidDocument / voidBill* / unmatch*). A new
 *            void path without one FAILS here before it can fail at the owner's COMMIT.
 *   live   — once 202615360930 is applied: all 26 document-side refusals exist and are ENABLED (never disarmed again
 *            without a ruling); before it applies, reported, not enforced.
 * Run: node scripts/verify-every-void-releases-its-bank-lines.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the 26 document-side refusals must be armed on the live database";
const LABEL = "verify-every-void-releases-its-bank-lines";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REARM = "202615360930_rearm_document_side_every_void_releases_its_lines.sql";

/** table -> the columns whose write makes that document not-live (from banking.bank_line_dead_link, 202615360600). */
export const DOCUMENTS = {
  "accounting.bills": "voided_at|revoked_at",
  "accounting.bill_payments": "voided_at|revoked_at",
  "accounting.expenses": "voided_at",
  "accounting.payments": "voided_at",
  "accounting.invoices": "voided_at",
  "accounting.journal_entries": "voided_at|reversed_by_je_id",
  "accounting.factoring_advances": "voided_at",
  "fuel.fuel_transactions": "voided_at",
  "banking.transfers": "voided_at|revoked_at",
  "mdata.loads": "voided_at|soft_deleted_at",
  "driver_finance.driver_settlements": "voided_at",
  "driver_finance.driver_advances": "voided_at",
  "integrations.relay_fuel_transactions": "voided_at",
};
/** table -> its bank-line pointer, and which shared primitives release that pointer for it. */
export const POINTER = {
  "accounting.bills": "matched_bill_id", "accounting.bill_payments": "matched_bill_payment_id", "accounting.expenses": "matched_expense_id",
  "accounting.payments": "matched_payment_id", "accounting.invoices": "matched_invoice_id", "accounting.journal_entries": "matched_journal_entry_id",
  "accounting.factoring_advances": "matched_factoring_advance_id", "fuel.fuel_transactions": "matched_fuel_transaction_id",
  "banking.transfers": "matched_transfer_id", "mdata.loads": "matched_load_id", "driver_finance.driver_settlements": "matched_settlement_id",
  "driver_finance.driver_advances": "matched_advance_id", "integrations.relay_fuel_transactions": "matched_relay_fuel_transaction_id",
};
// postVoidReversal -> unmatchBankTransactionsForVoid releases by BANK_LINE_MATCHED_COLUMN (void.service.ts) for these.
const VOID_CASCADE_COVERS = new Set(["accounting.bills", "accounting.bill_payments", "accounting.expenses", "accounting.payments",
  "accounting.invoices", "accounting.journal_entries", "accounting.factoring_advances", "fuel.fuel_transactions"]);
// stampDocumentVoided releases by BANK_LINE_POINTER_BY_FAMILY (void-document-stamp.service.ts) for these.
const STAMP_COVERS = new Set(["mdata.loads", "accounting.invoices", "accounting.expenses", "accounting.factoring_advances",
  "fuel.fuel_transactions", "accounting.journal_entries"]);

export function releasesFor(table, body) {
  if (new RegExp(`releaseBankLinesNamingDocument\\([\\s\\S]{0,240}?"${POINTER[table]}"`).test(body)) return true;
  if (VOID_CASCADE_COVERS.has(table) && /\b(postVoidReversal|unmatchBankTransactionsForVoid)\s*\(/.test(body)) return true;
  if (STAMP_COVERS.has(table) && /\bstampDocumentVoided\s*\(/.test(body)) return true;
  if (table === "banking.transfers" && /releaseBankLineMatchesWhere\([\s\S]{0,160}?matched_transfer_id/.test(body)) return true;
  return false;
}

/** The enclosing function body of an index: back to the nearest top-level function/arrow start, forward to its end. */
function enclosing(src, idx) {
  const starts = [...src.slice(0, idx).matchAll(/\n(?:export\s+)?(?:async\s+)?function\s+\w+|\n(?:export\s+)?const\s+\w+\s*(?::[^=]+)?=\s*async\s*\(/g)];
  const start = starts.length ? starts[starts.length - 1].index : 0;
  const next = /\n(?:export\s+)?(?:async\s+)?function\s+\w+|\n(?:export\s+)?const\s+\w+\s*(?::[^=]+)?=\s*async\s*\(/g;
  next.lastIndex = idx;
  const m = next.exec(src);
  return src.slice(start, m ? m.index : src.length);
}

/** files: [{ rel, src }] -> problems */
export function staticGaps(files) {
  const f = [];
  for (const { rel, src } of files) {
    for (const [table, cols] of Object.entries(DOCUMENTS)) {
      const re = new RegExp(`UPDATE\\s+${table.replace(".", "\\.")}\\b`, "g");
      let m;
      while ((m = re.exec(src))) {
        let stmt = src.slice(m.index, m.index + 800);
        const end = stmt.indexOf("`");
        if (end > 0) stmt = stmt.slice(0, end);
        if (!new RegExp(`SET[\\s\\S]*?\\b(${cols})\\s*=\\s*(now\\(\\)|COALESCE|\\$\\d|CURRENT)`).test(stmt)) continue;
        if (!releasesFor(table, enclosing(src, m.index))) {
          const line = src.slice(0, m.index).split("\n").length;
          f.push(`${rel}:${line}: ${table} stops being live here with no release of the bank lines that name it — call releaseBankLinesNamingDocument() first (ROUND 368.2(b))`);
        }
      }
    }
  }
  return f;
}

function backendFiles() {
  const out = execSync("git ls-files apps/backend/src", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  return out
    .filter((p) => p.endsWith(".ts") && !/__tests__|\.test\.ts$/.test(p))
    .map((rel) => ({ rel, src: fs.readFileSync(path.join(ROOT, rel), "utf8") }));
}

if (process.argv.includes("--selftest")) {
  const ok = { rel: "a.ts", src: "\nexport async function voidThing(client) {\n  await releaseBankLinesNamingDocument(client, { pointerColumn: \"matched_expense_id\" });\n  await client.query(`UPDATE accounting.expenses SET voided_at = now() WHERE id = $1`);\n}\n" };
  const bad = { rel: "b.ts", src: "\nexport async function voidThing(client) {\n  await client.query(`UPDATE accounting.expenses SET voided_at = now() WHERE id = $1`);\n}\n" };
  const other = { rel: "c.ts", src: "\nasync function touch(client) {\n  await client.query(`UPDATE accounting.expenses SET memo = $2 WHERE id = $1`);\n}\n" };
  const neighbour = { rel: "d.ts", src: "\nasync function a(client) {\n  await releaseBankLinesNamingDocument(client, {});\n}\nasync function b(client) {\n  await client.query(`UPDATE mdata.loads SET soft_deleted_at = now() WHERE id = $1`);\n}\n" };
  const cases = [
    ["release before the kill passes", staticGaps([ok]).length === 0],
    ["kill without release FAILS", staticGaps([bad]).length === 1],
    ["a non-killing update is ignored", staticGaps([other]).length === 0],
    ["a release in a DIFFERENT function does not count", staticGaps([neighbour]).length === 1],
    ["a release of ANOTHER pointer does not count", staticGaps([{ rel: "e.ts", src: "\nasync function v(client) {\n  await releaseBankLinesNamingDocument(client, { pointerColumn: \"matched_bill_payment_id\" });\n  await client.query(`UPDATE accounting.bills SET voided_at = now() WHERE id = $1`);\n}\n" }]).length === 1],
    ["the real tree is clean", staticGaps(backendFiles()).length === 0],
  ];
  const badCases = cases.filter(([, v]) => !v);
  if (badCases.length) { console.error(`${LABEL} selftest FAIL: ${badCases.map(([n]) => n).join(", ")}`); for (const g of staticGaps(backendFiles())) console.error(`  ${g}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = staticGaps(backendFiles());
const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await c.query("BEGIN READ ONLY");
  const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [REARM])).rowCount > 0;
  const t = (await c.query(`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE tgenabled <> 'D')::int AS armed,
           array_agg(tgname ORDER BY tgname) FILTER (WHERE tgenabled = 'D') AS disarmed
      FROM pg_trigger WHERE tgname LIKE '%\\_not\\_dead\\_under\\_bank\\_line' OR tgname LIKE '%\\_delete\\_not\\_under\\_bank\\_line'`)).rows[0];
  if (!applied) {
    console.log(`${LABEL}: PENDING DEPLOY — ${REARM} not in the ledger; document side ${t.armed}/${t.total} armed today (reported, not enforced)`);
  } else {
    if (t.total !== 26) fails.push(`expected 26 document-side refusals, found ${t.total}`);
    if (t.armed !== t.total) fails.push(`document-side refusals DISARMED: ${(t.disarmed ?? []).join(", ")}`);
    console.log(`${LABEL}: document side ${t.armed}/${t.total} armed`);
  }
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS — every void path releases the bank lines that name its document`);
