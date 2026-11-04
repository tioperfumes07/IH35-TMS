#!/usr/bin/env node
/**
 * ACCT-F11093 / register row 22 (R215) — "Escrow register: all same date/source, no load numbers; escrow is per load".
 * Measured 2026-11-03 on prod (USMCA): 62 escrow postings showed 5 distinct dates (posted_at, the day keyed) against 38
 * real document dates, carried no load, and the register guessed loads from currently-active settlement lines — 53 of
 * which had been voided as "SET-24 LINE-DUP" — so it showed $1,600.00 of $3,325.00 deposited.
 *
 * Static guard: the WRITER stamps document_date and records the per-load split (accounting.escrow_posting_loads) that
 * must tie to the posting; the settlement close refuses a contribution that does not split onto its loads; the unwind
 * release mirrors the deposit split; the register read model reads the writer's split + document date (never the
 * settlement_lines guess, never posted_at as the date); the register screen shows a linked Load column and the
 * document date.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-posting-load-and-date";
const FILES = {
  service: "apps/backend/src/accounting/escrow/service.ts",
  close: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  unwind: "apps/backend/src/driver-finance/settlement-payrun-subledger-unwind.service.ts",
  route: "apps/backend/src/banking/escrow-visualizer.routes.ts",
  page: "apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx",
  migration: "db/migrations/202616370100_escrow_posting_document_date_and_loads.sql",
};

function between(s, startNeedle, endNeedle) {
  const i = s.indexOf(startNeedle);
  if (i < 0) return "";
  const j = s.indexOf(endNeedle, i + startNeedle.length);
  return s.slice(i, j < 0 ? undefined : j);
}

export function findDefects(src) {
  const out = [];
  const { service, close, unwind, route, page, migration } = src;

  // Migration: the column + the append-only split table.
  if (!/ALTER TABLE accounting\.escrow_postings ADD COLUMN IF NOT EXISTS document_date date/.test(migration)) out.push("migration does not add escrow_postings.document_date");
  if (!/CREATE TABLE IF NOT EXISTS accounting\.escrow_posting_loads/.test(migration)) out.push("migration does not create accounting.escrow_posting_loads");
  if (!/REFERENCES mdata\.loads\(operating_company_id, id\)/.test(migration)) out.push("escrow_posting_loads.load_id is not an entity-scoped FK to mdata.loads");
  if (!/v_split > v_amount/.test(migration)) out.push("escrow_posting_loads has no split <= posting check");
  if (!/escrow_posting_loads is append-only/.test(migration)) out.push("escrow_posting_loads is not append-only");
  if (!/FORCE ROW LEVEL SECURITY/.test(migration)) out.push("escrow_posting_loads RLS is not forced");

  // Writer: recordEscrowPostingOnly stamps document_date and writes the tied split.
  const rec = between(service, "export async function recordEscrowPostingOnly(", "\n/** ACCT-F11093 — one load's share");
  if (!rec) out.push("recordEscrowPostingOnly not found");
  if (!/const loads = assertEscrowLoadSplit\(amount, input\.loads\)/.test(rec)) out.push("recordEscrowPostingOnly does not validate the per-load split against the amount");
  if (!/linked_journal_entry_id, document_date\s*\)/.test(rec)) out.push("recordEscrowPostingOnly does not insert document_date");
  if (!/COALESCE\(\$10::date,\s*\(SELECT je\.entry_date FROM accounting\.journal_entries je/.test(rec)) out.push("recordEscrowPostingOnly document_date is not caller date -> linked JE entry_date");
  if (!/await insertEscrowPostingLoads\(client,/.test(rec)) out.push("recordEscrowPostingOnly does not write the per-load split");
  const assertFn = between(service, "export function assertEscrowLoadSplit(", "\nasync function insertEscrowPostingLoads(");
  if (!/if \(total !== amountCents\)\s*\{\s*throw new Error\(`escrow_posting_load_split_mismatch/.test(assertFn)) out.push("a split that does not tie to the posting is not refused");
  if (!/seen\.has\(r\.load_id\)\) throw/.test(assertFn)) out.push("a split naming one load twice is not refused");
  const txn = between(service, "async function postEscrowTransactionOnClient", "/** Thin wrapper");
  if (txn && !/linked_journal_entry_id,\s*document_date\s*\)/.test(txn)) out.push("postEscrowTransactionOnClient does not insert document_date");
  if (txn && !/postingDate,\s*\]/.test(txn)) out.push("postEscrowTransactionOnClient document_date is not the JE posting date");

  // Settlement close: per-load, refuse a split that does not tie.
  const closeBlock = between(close, "if (escrowContributionCents > 0) {\n      // ACCT-F11093", "// Records-only disbursement");
  if (!closeBlock) out.push("settlement close escrow posting block (ACCT-F11093) not found");
  if (!/loadSettlementEscrowLoadSplit\(client, opco, settlementId\)/.test(closeBlock)) out.push("settlement close does not read the per-load escrow split");
  if (!/split\.lines_without_load > 0 \|\| split\.total_cents !== escrowContributionCents/.test(closeBlock)) out.push("settlement close does not refuse an escrow contribution that does not split onto its loads");
  if (!/loads: escrowLoads,/.test(closeBlock)) out.push("settlement close does not pass the per-load split to the escrow posting");

  // Unwind: the release mirrors the deposit split.
  if (!/FROM accounting\.escrow_posting_loads epl/.test(unwind) || !/loads: releaseSplitTies \? releaseLoads : null,/.test(unwind)) out.push("unwind release does not mirror the deposit's per-load split");

  // Read model: the writer's split + document date.
  const tl = between(route, 'app.get("/api/v1/banking/escrow-visualizer/:driver_id"', 'app.get(\n    "/api/v1/banking/escrow-visualizer/ledger"');
  if (!tl) out.push("timeline route not found");
  if (!/LEFT JOIN accounting\.escrow_posting_loads epl/.test(tl)) out.push("register read model does not read accounting.escrow_posting_loads");
  if (/line_type = 'escrow_contribution'/.test(tl)) out.push("register read model still guesses loads from settlement_lines escrow_contribution");
  if (!/COALESCE\(epl\.document_date, ep\.document_date, je\.entry_date\)::text AS document_date/.test(tl)) out.push("register read model does not return the document date");
  if (/filters\.push\(`ep\.posted_at [<>]=/.test(tl)) out.push("register period filter reads posted_at, not the document date");

  // Screen: linked Load column + document date.
  if (!/to=\{`\/dispatch\/loads\/\$\{encodeURIComponent\(r\.loadId\)\}`\}/.test(page)) out.push("register screen has no linked Load column");
  if (/date: t\.created_at/.test(page)) out.push("register screen dates a row by created_at (posted_at), not its document date");
  if (!/date: rowDate,/.test(page)) out.push("register screen row date is not the document date");
  return out;
}

function readAll() {
  const src = {};
  for (const [k, f] of Object.entries(FILES)) {
    const p = path.join(ROOT, f);
    src[k] = existsSync(p) ? readFileSync(p, "utf8") : "";
  }
  return src;
}

const src = readAll();
if (process.argv.includes("--selftest")) {
  const plant = (key, from, to) => ({ ...src, [key]: src[key].replace(from, to) });
  const plants = [
    ["writer drops document_date", plant("service", "source_type, source_id, note, posted_at, posted_by_user_id, linked_journal_entry_id, document_date\n", "source_type, source_id, note, posted_at, posted_by_user_id, linked_journal_entry_id\n")],
    ["writer skips the split", plant("service", "await insertEscrowPostingLoads(client,", "void (client,")],
    ["writer accepts an untied split", plant("service", "if (total !== amountCents) {", "if (false) {")],
    ["writer accepts a duplicated load", plant("service", "if (seen.has(r.load_id)) throw", "if (false) throw")],
    ["manual deposit undated", plant("service", "        postingDate,\n      ]", "      ]")],
    ["close does not refuse", plant("close", "split.lines_without_load > 0 || split.total_cents !== escrowContributionCents", "false")],
    ["close drops loads", plant("close", "loads: escrowLoads,", "loads: null,")],
    ["unwind drops loads", plant("unwind", "loads: releaseSplitTies ? releaseLoads : null,", "loads: null,")],
    ["read model back to settlement_lines guess", plant("route", "LEFT JOIN accounting.escrow_posting_loads epl", "LEFT JOIN driver_finance.settlement_lines epl ON epl.line_type = 'escrow_contribution'")],
    ["read model has no document date", plant("route", "COALESCE(epl.document_date, ep.document_date, je.entry_date)::text AS document_date", "ep.posted_at::text AS document_date")],
    ["screen dated by posted_at", plant("page", "date: rowDate,", "date: t.created_at,")],
    ["screen load not linked", plant("page", "to={`/dispatch/loads/${encodeURIComponent(r.loadId)}`}", "to={`/x`}")],
    ["split table not append-only", plant("migration", "escrow_posting_loads is append-only", "noop")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(planted).some((k) => planted[k] !== src[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const d = findDefects(src);
if (d.length) {
  console.error(`${LABEL} FAIL:\n - ${d.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — every escrow posting carries its document date and per-load split; the register reads them`);
