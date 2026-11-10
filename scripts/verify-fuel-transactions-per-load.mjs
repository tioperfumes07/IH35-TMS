#!/usr/bin/env node
// verify-fuel-transactions-per-load — "one fuel purchase on a settlement document -> one live
// fuel.fuel_transactions row, on the same load, for the same dollars, on the same date."
//
// LEAD 443.69 item 2 (2026-10-11) — rebuilt at root. Old rule -> new rule -> why:
//   (1) OLD: the expected set was data/alwaystrack/settlements-truth-2026-09-13.json (171 receipts), and a
//       receipt purged under a governed purge (audit.record_deletions, AUTH-400) counted as "missing".
//       NEW: the expected set is DERIVED from the Settlement Creator documents (one per signed settlement,
//       extracted to data/settlement-creator/fuel-source-documents.json by scripts/build-fuel-source-documents.mjs)
//       and matched ROW BY ROW — load, invoice, cents — then summed per load (count and dollars). A document
//       line with no live row whose receipt was deleted by a governed purge (deletion_route = 'auth_purge' with
//       an auth_id) is reported as purged under that AUTH, not missing.
//       WHY: the 2026-09-13 truth file predates the AUTH-400 purge and the Creator re-feed; it reported 38
//       "missing" receipts that were governed deletions.
//   (2) OLD: a frozen whole-table ratchet (321 rows / $172,553.14 in the .baseline.json), re-stamped by hand
//       after every seeding or void. NEW: no frozen count. Every live row must be SOURCED — matched to a
//       document line, or named in a driver_finance.settlement_creator.posted audit event (the Creator's own
//       record of the fuel rows it wrote), or tied to a Relay file transaction (integrations.relay_fuel_transactions)
//       — and each Relay transaction's live rows must sum to the Relay file's total_amount_paid_cents.
//       WHY: the next seeding adds its documents; it never needs a rebaseline.
//   (3) OLD: the SOURCE_DATE_CORRECTED flag came from the B1 ingestion. NEW: date_corrections in the source
//       extract, each quoting the printed settlement; every other line's date must equal its document's.
//   Kept unchanged: DEF/diesel GL segregation (assertion 3) and the cross-load duplicate receipt list.
//
// LEAD 443.198 (2026-10-17) — a fourth source. Old rule -> new rule -> why:
//   OLD: a live row was sourced only by a settlement document line, a Creator posted event or a Relay transaction.
//   NEW: a row written by the Dreamline provider-statement import (fuel/dreamline-statement-import.service.ts,
//   LEAD 443.142) is STATEMENT-SOURCED — the provider's own statement is its source document. Proven from the
//   import's own record only, never from a note alone: source = 'import', notes carry the import's marker
//   "443.142 Dreamline statement" AND "efs_invoice=<the row's transaction_reference>", and the row was written in the
//   SAME transaction as a fuel.dreamline_statement_imported audit event (created_at = that event's created_at). Every
//   such batch must hold exactly the event's by_outcome.imported.lines rows (live + voided) — a marker on a row the
//   import never wrote, or a batch that grew, fails. A statement-sourced row never satisfies a document line (a
//   document line with no live row is still "missing") and is kept out of the per-load document tie (shown apart).
//   WHY: the 2026-10-16 14:46Z import booked 75 statement lines with no booked receipt (63 still live after the
//   443.194/443.197 voids); the guard knew no statement source and named all 63 "unsourced" (PASS at 14:21Z, red
//   from the next run).
//
// LEAD 443.198 (2026-10-17) — the Relay records' WRITER is checked too (static, no DB). Old rule -> new rule -> why:
//   OLD: the guard read the data only; the Settlement Creator wrote a Relay fill's row at the amount typed off the printed
//   settlement (netCents = the PUMP price) and no row for the fill's DEF line, so every new Relay settlement re-broke the
//   "Relay sum = Relay paid" check after the fact (5839-5842, 2026-10-16: 24 fills).
//   NEW: --static (and every live run) asserts the Creator writes a Relay fill's rows through the one engine
//   (fuel/relay-fill-fuel-rows.ts writeRelayFillFuelRows), which reads integrations.relay_fuel_transaction_lines (discounted
//   amount per product line) and refuses lines that do not foot to Relay's paid; the Creator's own INSERT is never reached
//   for a Relay row.
//   WHY: the record must be wrong-proof at the writer, not caught a day later on prod.
//
// ACCT-F11105 (2026-11-04) — a fifth source, and a new failure. Old rule -> new rule -> why:
//   OLD: a Relay-tied row on a load that HAS a settlement document had to be on a document line; a Relay row was only ever
//   written by the Settlement Creator, from a printed line.
//   NEW: (a) a row ENG-65 recorded at receipt (fuel/relay-fill-fuel-rows.ts ensureRelayFillFuelRecords: notes carry its
//   marker "ENG-65: Relay fill recorded at receipt from its own Relay lines" AND its reference IS its live Relay fill's own
//   transaction_id) is RELAY-FILE-SOURCED — the Relay file is its source document, exactly as a provider statement is for a
//   Dreamline / WEX import row (443.198 / 443.202). It never satisfies a document line, its Relay sum is still checked
//   against what Relay paid, and it is listed for the owner's "Not on the settlement" review. (b) NEW FAILURE: a Relay fill
//   whose purchase another rail already records — the same ticket on any truck (identical metered gallons, ±1 day, the
//   ticket total = Relay's retail; fuel/relay-fill-other-rail-ticket.ts, read from the engine's own SQL) — fails while any
//   live row is tied to it: one purchase, two records.
//   WHY: ENG-65 (#28457) records fills no settlement printed, on the load its expense document carries; its first sweep
//   (2026-11-04 12:00Z) put 29 such rows on documented loads (red), 16 of them second records of 13 purchases already on
//   DREAMLINE settlement rows on another truck — those were voided; the 13 others are real Relay fills on no document.
//
// ACCT-F11107 (2026-11-10) — a document line whose receipt was VOIDED AS A DUPLICATE OF A RELAY FILL. Old -> new -> why:
//   OLD: a document line with no live row was "missing" unless purged / on another load / a listed second entry.
//   NEW: a line whose fuel row was voided by the void engine as a duplicate of a Relay fill — the row's void_reason names
//   the fill ("ACCT-F11107: … Relay [fill ]txn_…") or the voided row carries relay_fuel_transaction_id — is REPLACED, not
//   missing, only while that Relay fill is live AND booked (a live, unreversed fuel_event posting on the fill). Same load,
//   same invoice, same cents as the line. A replacement whose fill is not booked still fails (by name).
//   WHY: owner rule "on the Relay statement = Relay" (11-09): 13 DREAMLINE settlement receipts double-booked with their
//   Relay fill and 10 DREAMLINE-only receipts that were Relay fills were voided (the Relay fill carries the cost); every
//   one read "missing" and turned required-live-load-guard red (job 129572504458).
//
// --selftest runs the pure comparator against fixtures (no DB). Live: fails closed with no DATABASE_URL
// (requireLiveDbOrExit, ROUND 29.9-B); money-pr-local-gate.mjs runs it when its own domain paths change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-fuel-transactions-per-load";
export const REQUIRES_LIVE_DB =
  "live-data money guard; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B) and runs in money-pr-local-gate.mjs only when its own domain paths change or a live DB is present (Lead ruling R56-B, 2026-09-22)";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SOURCE_PATH = path.join(process.cwd(), "data/settlement-creator/fuel-source-documents.json");
const BASELINE_PATH = path.join(process.cwd(), "scripts/verify-fuel-transactions-per-load.baseline.json");

const cents = (v) => Math.round(Number(v) * 100);
const money = (c) => `$${(c / 100).toFixed(2)}`;
/** A copy re-booked on a second load carries "<invoice>-<load>" (AUTH-209/398 pattern). */
const baseRef = (ref, load) => String(ref ?? "").replace(new RegExp(`-${load}$`), "");
/** 443.73 #6(e): the receipt's own number, whatever load suffix a re-feed hung on it. */
export const baseInvoice = (ref) => String(ref ?? "").replace(/-1[0-9]{4}$/, "");

/**
 * Pure comparator. documents: [{settlement_no, fuel_purchases:[{load_number, invoice, date, receipt_cents, card}]}]
 * live: active rows [{id, load_number, ref, cents, date, relay_id}]; purged: [{ref, cents, auth_id}];
 * relayTotals: Map(relay_id -> {paid_cents, dead}); creatorIds: Set(fuel id named by a Creator posted event).
 * statementIds: Set(fuel id the Dreamline statement import wrote — proven by statementRowIsImported + its batch);
 * statementBatches: [{event_id, at, declared_lines, rows}] — every import event's declared imported lines vs the rows
 * (live + voided) written in its transaction.
 */
/** ACCT-F11105 — ENG-65's own marker on the rows it records at receipt (fuel-expense-document.service.ts writes it). */
export const RELAY_AT_RECEIPT_MARKER = "ENG-65: Relay fill recorded at receipt from its own Relay lines";
/** A row ENG-65 recorded at receipt: its marker AND its reference is its live Relay fill's own transaction id. Pure. */
export function relayAtReceiptRow(r, relayTotals) {
  if (!r.relay_id || !r.ref || !String(r.notes ?? "").includes(RELAY_AT_RECEIPT_MARKER)) return false;
  const rt = relayTotals.get(r.relay_id);
  return Boolean(rt && !rt.dead && rt.txn && rt.txn === r.ref);
}

export function compareFuel({ documents, corrections = [], documentDuplicates = [], live, purged = [], relayTotals = new Map(), creatorIds = new Set(), statementIds = new Set(), statementBatches = [], otherRailByRelay = new Map(), replacedByRelay = [] }) {
  const failures = [];
  const notes = [];
  for (const b of statementBatches) {
    if (b.rows !== b.declared_lines) {
      failures.push(`statement: Dreamline import ${String(b.event_id).slice(0, 8)} at ${b.at} declares ${b.declared_lines} imported line(s) but ${b.rows} fuel row(s) carry its marker in its transaction`);
    }
  }
  const fix = new Map(corrections.map((c) => [`${c.load_number}|${c.invoice}|${c.receipt_cents}`, c]));
  const byLoad = new Map();
  for (const r of live) {
    if (!byLoad.has(r.load_number)) byLoad.set(r.load_number, []);
    byLoad.get(r.load_number).push(r);
  }
  const used = new Set();
  const gpsMoved = [];
  const printedReceipts = new Map();
  for (const d of documents) for (const ln of d.fuel_purchases) {
    const k = `${baseInvoice(ln.invoice)}|${ln.receipt_cents}`;
    if (!printedReceipts.has(k)) printedReceipts.set(k, { load: String(ln.load_number), settlement: d.settlement_no });
  }
  const purgedLeft = purged.map((p) => ({ ...p }));
  const replacedUsed = new Set();
  const perLoad = new Map();
  let expectedRows = 0;
  for (const doc of documents) {
    for (const line of doc.fuel_purchases) {
      expectedRows++;
      const load = String(line.load_number);
      const t = perLoad.get(load) || { docN: 0, docC: 0 };
      t.docN++; t.docC += line.receipt_cents;
      perLoad.set(load, t);
      const pool = byLoad.get(load) || [];
      const hit = pool.find((r) => !used.has(r.id) && r.cents === line.receipt_cents && baseRef(r.ref, load) === String(line.invoice))
        ?? pool.find((r) => !used.has(r.id) && r.cents === line.receipt_cents && r.date === line.date);
      if (hit) {
        used.add(hit.id);
        const c = fix.get(`${load}|${line.invoice}|${line.receipt_cents}`);
        const want = c ? c.true_date : line.date;
        if (hit.date !== want) {
          failures.push(c
            ? `date: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} is ${hit.date} live; the document proves ${want} — ${c.evidence}`
            : `date: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} — document ${line.date}, live ${hit.date} (row ${hit.id.slice(0, 8)})`);
        }
        if (line.card === "relay" && !hit.relay_id) {
          failures.push(`relay: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} is a Relay purchase on the document but live row ${hit.id.slice(0, 8)} is not tied to a Relay file transaction`);
        }
        continue;
      }
      const p = purgedLeft.findIndex((x) => x.cents === line.receipt_cents && baseRef(x.ref, load) === String(line.invoice));
      if (p >= 0) {
        notes.push(`purged, not missing: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} — deleted under ${purgedLeft[p].auth_id} (audit.record_deletions)`);
        purgedLeft.splice(p, 1);
        continue;
      }
      // 443.73 #6(d): a receipt printed on two settlement documents is posted ONCE; the second document SHOWS it as already
      // on the load that carries it — not missing, and never a second expense.
      const elsewhere = live.find((r) => r.load_number !== load && baseInvoice(r.ref) === baseInvoice(line.invoice) && r.cents === line.receipt_cents &&
        (!line.fuel_type || !r.fuel_type || r.fuel_type === line.fuel_type));
      if (elsewhere) {
        notes.push(`already on load ${elsewhere.load_number}: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} — one receipt, one expense`);
        continue;
      }
      // A document line proven to be a second entry of a receipt kept on another load (source extract document_duplicates,
      // each with its evidence quoted) is shown, not missing — and only while the kept line is still live.
      const dup = documentDuplicates.find((x) => String(x.load_number) === load && String(x.invoice) === String(line.invoice) && x.receipt_cents === line.receipt_cents);
      if (dup && live.some((r) => r.load_number === String(dup.kept_on_load) && baseInvoice(r.ref) === baseInvoice(dup.kept_invoice) && (!dup.fuel_type || r.fuel_type === dup.fuel_type))) {
        notes.push(`second entry of receipt ${dup.kept_invoice}: settlement ${doc.settlement_no} load ${load} ${money(line.receipt_cents)} — the receipt is on load ${dup.kept_on_load}`);
        continue;
      }
      // ACCT-F11107: voided as a duplicate of a Relay fill — replaced while that fill is live and booked.
      // Same load first; else the receipt on another load (443.73 #6(d): one receipt, posted once, on the load that carried it).
      const repl = replacedByRelay.find((x) => !replacedUsed.has(x.id) && String(x.load_number) === load && x.cents === line.receipt_cents && baseRef(x.ref, load) === String(line.invoice))
        ?? replacedByRelay.find((x) => !replacedUsed.has(x.id) && x.cents === line.receipt_cents && baseInvoice(x.ref) === baseInvoice(line.invoice));
      if (repl) {
        replacedUsed.add(repl.id);
        if (repl.booked) {
          notes.push(`replaced by Relay fill ${repl.relay_txn}: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} — row ${String(repl.id).slice(0, 8)} voided as its duplicate (on the Relay statement = Relay)`);
          continue;
        }
        failures.push(`missing: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} — row ${String(repl.id).slice(0, 8)} was voided as a duplicate of Relay fill ${repl.relay_txn ?? "(unnamed)"}, but that fill is not live and booked`);
        continue;
      }
      failures.push(`missing: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} ${line.date} has no live fuel row`);
    }
  }
  let statementSourced = 0;
  let relayAtReceipt = 0;
  for (const r of live) {
    const t = perLoad.get(r.load_number);
    // 443.198: a statement-sourced row no document line took is the provider statement's fill, not the document's —
    // shown apart from the per-load document tie, never a failure.
    if (!used.has(r.id) && statementIds.has(r.id)) {
      statementSourced++;
      if (t) { t.stmtN = (t.stmtN || 0) + 1; t.stmtC = (t.stmtC || 0) + r.cents; }
      continue;
    }
    if (t) { t.liveN = (t.liveN || 0) + 1; t.liveC = (t.liveC || 0) + r.cents; }
    if (used.has(r.id)) continue;
    // LEAD 443.214 / owner 10-21 5:31 PM CT ("the engine is the source of truth, not the hand-typed settlement"): a row the
    // fuel engine moved by GPS / owner ruling (fuel_transactions.truck_resolution, audited fuel.fill_truck_and_load_resolved)
    // whose receipt IS printed on a settlement document — under the truck's old load — is sourced by that line. Never a
    // failure on its new load; listed for the owner's "Not on the settlement" review. Checked last, so it never takes a row a
    // document line on its own load would match.
    // The same holds for a moved row whose own source is a Creator posting or a Relay transaction (the sources an
    // undocumented load already accepts below): moving it onto a documented load does not un-source it.
    const engineMoved = r.truck_resolution && /^(gps|owner_ruling)/.test(String(r.truck_resolution));
    const printed = printedReceipts.get(`${baseInvoice(r.ref)}|${r.cents}`);
    if (engineMoved && (printed || creatorIds.has(r.id) || r.relay_id)) {
      const how = printed ? `settlement ${printed.settlement} printed invoice ${r.ref} ${money(r.cents)} on load ${printed.load}` : `${r.relay_id ? "Relay" : "Creator"}-sourced invoice ${r.ref} ${money(r.cents)}, on no settlement document`;
      gpsMoved.push({ id: r.id, now_on: r.load_number, printed_on: printed?.load ?? null, settlement: printed?.settlement ?? null, invoice: r.ref, cents: r.cents });
      notes.push(`moved by the fuel engine (${String(r.truck_resolution).split(":")[0]}): ${how}; it is on load ${r.load_number} — "Not on the settlement" review`);
      continue;
    }
    // ACCT-F11105 (a): a Relay fill ENG-65 recorded at receipt is sourced by the Relay file — on a documented load it is
    // listed for "Not on the settlement" review, never matched to a document line. A fill another rail already records is
    // failed below (b), never sourced here.
    if (t && relayAtReceiptRow(r, relayTotals) && !otherRailByRelay.has(r.relay_id)) {
      relayAtReceipt++;
      notes.push(`Relay fill recorded at receipt (ENG-65), on no settlement document: load ${r.load_number} invoice ${r.ref} ${money(r.cents)} ${r.date} — "Not on the settlement" review`);
      continue;
    }
    if (t) {
      failures.push(`unsourced: load ${r.load_number} live row ${r.id.slice(0, 8)} invoice ${r.ref} ${money(r.cents)} ${r.date} is on no settlement document line`);
    } else if (!creatorIds.has(r.id) && !r.relay_id) {
      failures.push(`unsourced: live row ${r.id.slice(0, 8)} load ${r.load_number ?? "(none)"} invoice ${r.ref} ${money(r.cents)} — no settlement document, no Creator posting, no Relay transaction`);
    }
  }
  let loadsTied = 0;
  for (const [load, t] of perLoad) {
    if (t.docN === (t.liveN || 0) && t.docC === (t.liveC || 0)) loadsTied++;
    else notes.push(`load ${load}: document ${t.docN} / ${money(t.docC)} vs live ${t.liveN || 0} / ${money(t.liveC || 0)}`);
    if (t.stmtN) notes.push(`load ${load}: + ${t.stmtN} Dreamline statement fill(s) / ${money(t.stmtC)} not printed on its settlement document (statement-sourced)`);
  }
  const relaySums = new Map();
  for (const r of live) if (r.relay_id) relaySums.set(r.relay_id, (relaySums.get(r.relay_id) || 0) + r.cents);
  for (const [rid, sum] of relaySums) {
    const rt = relayTotals.get(rid);
    if (!rt) failures.push(`relay: live rows point at Relay transaction ${rid} which is not in the Relay file`);
    else if (rt.dead) failures.push(`relay: Relay transaction ${rid} is voided/inactive but ${money(sum)} of live fuel rows still point at it`);
    else if (rt.paid_cents !== sum) failures.push(`relay: Relay transaction ${rid} paid ${money(rt.paid_cents)} but its live fuel rows sum to ${money(sum)}`);
    // ACCT-F11105 (b): one purchase, one record — never a Relay record AND another rail's record of the same ticket.
    const other = otherRailByRelay.get(rid);
    if (other && other.length) {
      failures.push(`relay: Relay transaction ${rt?.txn ?? rid} has ${money(sum)} of live fuel rows AND is recorded on another rail by ticket ${[...new Set(other.map((o) => o.ref))].join(", ")} (${other.map((o) => `${String(o.id).slice(0, 8)} ${o.card ?? "no card"}`).join(", ")}) — one purchase, two records`);
    }
  }
  return { failures, notes, expectedRows, loads: perLoad.size, loadsTied, relayTxns: relaySums.size, statementSourced, relayAtReceipt, gpsMoved };
}

/** 443.198 — the Creator's Relay rows come from the fill's own lines (pure: source texts in, problems out). */
export const CREATOR_PATH = "apps/backend/src/driver-finance/settlement-creator.service.ts";
export const RELAY_ROWS_ENGINE_PATH = "apps/backend/src/fuel/relay-fill-fuel-rows.ts";
/** The body of the Creator's Relay branch `if (!reused && fuel.card === "relay" && relayFillId) { … }` (brace-matched), or null. */
export function relayBranch(src) {
  const head = 'if (!reused && fuel.card === "relay" && relayFillId) {';
  const at = src.indexOf(head);
  if (at < 0) return null;
  let depth = 0;
  for (let i = at + head.length - 1; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  return null;
}

export function creatorRelayRowProblems(creatorSrc, engineSrc) {
  const p = [];
  if (!/import\s*\{[^}]*\bwriteRelayFillFuelRows\b[^}]*\}\s*from\s*"\.\.\/fuel\/relay-fill-fuel-rows\.js"/.test(creatorSrc)) {
    p.push("the Settlement Creator does not import writeRelayFillFuelRows (fuel/relay-fill-fuel-rows.ts)");
  }
  // LEAD 443.232 c: the writer call must be INSIDE the Relay branch — matched by braces, not a 900-char window (the 443.215
  // edit / repost adoption grew the branch past the window while the call stayed exactly where the rule wants it).
  if (!/await writeRelayFillFuelRows\(/.test(relayBranch(creatorSrc) ?? "")) {
    p.push("the Settlement Creator's Relay path does not write the fill's rows through writeRelayFillFuelRows");
  }
  if (!/const inserted = reused \? \{ rows: \[\{ id: reused \}\] \} : relayRowId \? \{ rows: \[\{ id: relayRowId \}\] \} : await client\.query/.test(creatorSrc)) {
    p.push("the Settlement Creator's own fuel INSERT (netCents, the printed amount) is still reachable for a Relay row");
  }
  if (!engineSrc) {
    p.push(`${RELAY_ROWS_ENGINE_PATH} is missing`);
    return p;
  }
  if (!/FROM integrations\.relay_fuel_transaction_lines/.test(engineSrc) || !/total_discounted_price_cents/.test(engineSrc)) {
    p.push("writeRelayFillFuelRows does not read the fill's own lines (relay_fuel_transaction_lines.total_discounted_price_cents)");
  }
  if (!/p\.total_cents \/ 100/.test(engineSrc)) p.push("writeRelayFillFuelRows does not write total_cost from the line amount");
  if (!/"relay_fill_lines_do_not_foot"/.test(engineSrc)) p.push("writeRelayFillFuelRows does not refuse lines that do not foot to Relay's paid");
  if (!/FUEL_TYPE_FOR_RELAY_KIND\[relayLineKind\(l\)\]/.test(engineSrc)) p.push("writeRelayFillFuelRows does not take each row's product from the line (DEF its own fuel_type)");
  return p;
}
function readOrNull(rel) {
  const f = path.join(process.cwd(), rel);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}
/** ACCT-F11105 — the other-rail ticket rule, read from the engine's own SQL so the guard measures what the engine refuses. */
export const OTHER_RAIL_PATH = "apps/backend/src/fuel/relay-fill-other-rail-ticket.ts";
export const RECEIPT_WRITER_PATH = "apps/backend/src/fuel/fuel-expense-document.service.ts";
export function otherRailTicketSql(src, alias) {
  const m = /export const OTHER_RAIL_TICKET_ROWS_SQL = \(r: string\) => `([\s\S]*?)`;/.exec(src ?? "");
  return m ? m[1].replaceAll("${r}", alias) : null;
}
export function receiptRecordProblems(otherRailSrc, linkSrc, rowsSrc, writerSrc) {
  const p = [];
  if (!otherRailTicketSql(otherRailSrc, "r")) p.push(`${OTHER_RAIL_PATH} does not export OTHER_RAIL_TICKET_ROWS_SQL`);
  if (!/CROSS JOIN LATERAL \(\$\{OTHER_RAIL_TICKET_ROWS_SQL\("r"\)\}\) q/.test(linkSrc ?? "")) p.push("crossRailFuelRowsForRelayFill does not include the other-rail ticket rows (any truck)");
  const ensure = (rowsSrc ?? "").slice((rowsSrc ?? "").indexOf("export async function ensureRelayFillFuelRecords("));
  const iAsk = ensure.indexOf("await crossRailFuelRowsForRelayFill(");
  const iWrite = ensure.indexOf("await writeRelayFillFuelRows(");
  if (iAsk < 0 || iWrite < 0 || iAsk > iWrite || !/"relay_fill_recorded_on_other_rail"/.test(ensure)) p.push("ENG-65 does not refuse, before writing, a fill another rail already records");
  if (!(writerSrc ?? "").includes(`notes: "${RELAY_AT_RECEIPT_MARKER}"`)) p.push(`the receipt writer no longer stamps "${RELAY_AT_RECEIPT_MARKER}" (the Relay-at-receipt source cannot be proven)`);
  return p;
}
function staticCheck() {
  const problems = [
    ...creatorRelayRowProblems(readOrNull(CREATOR_PATH) ?? "", readOrNull(RELAY_ROWS_ENGINE_PATH)),
    ...receiptRecordProblems(readOrNull(OTHER_RAIL_PATH), readOrNull("apps/backend/src/fuel/relay-fill-link.service.ts"), readOrNull(RELAY_ROWS_ENGINE_PATH), readOrNull(RECEIPT_WRITER_PATH)),
  ];
  for (const q of problems) console.error(`  ✗ static: ${q}`);
  return problems;
}

/** 443.198 — the import's own marker on one row (pure; the batch tie to the audit event is applied by the caller). */
export const STATEMENT_MARKER = "443.142 Dreamline statement";
/**
 * LEAD 443.202 (2026-10-21) — one fuel-card statement engine, two rails. Old rule -> new rule -> why:
 *   OLD: only the Dreamline statement import (marker + efs_invoice + fuel.dreamline_statement_imported) was a source.
 *   NEW: every rail of the ONE statement engine (fuel/dreamline-statement-import.service.ts FuelCardStatementRail) is a
 *   source, proven the same way — its own marker + its own invoice key + a row written in the SAME transaction as its
 *   own import event, the batch holding exactly the event's by_outcome.imported.lines.
 *   WHY: the 10-21 21:05Z England WEX import posted 9 fills (loads 13686 / 13688 / 13693) the guard named "unsourced".
 */
export const STATEMENT_RAILS = [
  { event: "fuel.dreamline_statement_imported", marker: STATEMENT_MARKER, invoiceKey: "efs_invoice", label: "Dreamline" },
  { event: "fuel.wex_statement_imported", marker: "443.202 England WEX statement", invoiceKey: "wex_invoice", label: "England WEX" },
];
export function statementRowIsImported(r) {
  if (r.source !== "import" || !r.notes || !r.ref) return false;
  const parts = String(r.notes).split(";").map((p) => p.trim());
  return STATEMENT_RAILS.some((rail) => parts.includes(rail.marker) && parts.includes(`${rail.invoiceKey}=${r.ref}`));
}

function selftest() {
  const doc = (lines) => [{ settlement_no: "1", fuel_purchases: lines }];
  const L = (o) => ({ load_number: "100", invoice: "A1", date: "2026-08-01", receipt_cents: 5000, card: "dreamline", ...o });
  const R = (o) => ({ id: "aaaaaaaa-1", load_number: "100", ref: "A1", cents: 5000, date: "2026-08-01", relay_id: null, ...o });
  const cases = [
    ["exact match passes", { documents: doc([L()]), live: [R()] }, 0],
    ["missing row fails", { documents: doc([L()]), live: [] }, 1],
    ["governed purge is not missing", { documents: doc([L()]), live: [], purged: [{ ref: "A1", cents: 5000, auth_id: "AUTH-400" }] }, 0],
    ["purge of a different amount does not excuse", { documents: doc([L()]), live: [], purged: [{ ref: "A1", cents: 4999, auth_id: "AUTH-400" }] }, 1],
    ["extra row on a documented load fails", { documents: doc([L()]), live: [R(), R({ id: "bbbbbbbb-2", ref: "B2" })] }, 1],
    ["wrong cents fails twice (missing + unsourced)", { documents: doc([L()]), live: [R({ cents: 5001 })] }, 2],
    ["re-booked copy ref <invoice>-<load> matches", { documents: doc([L()]), live: [R({ ref: "A1-100" })] }, 0],
    ["date drift fails", { documents: doc([L()]), live: [R({ date: "2026-08-02" })] }, 1],
    ["corrected date passes", { documents: doc([L({ date: "2026-09-29" })]), corrections: [{ load_number: "100", invoice: "A1", receipt_cents: 5000, true_date: "2026-08-29", evidence: "q" }], live: [R({ date: "2026-08-29" })] }, 0],
    ["uncorrected misprint fails", { documents: doc([L({ date: "2026-09-29" })]), corrections: [{ load_number: "100", invoice: "A1", receipt_cents: 5000, true_date: "2026-08-29", evidence: "q" }], live: [R({ date: "2026-09-29" })] }, 1],
    ["row on undocumented load with no source fails", { documents: doc([]), live: [R({ load_number: "200" })] }, 1],
    ["row on undocumented load named by Creator passes", { documents: doc([]), live: [R({ load_number: "200" })], creatorIds: new Set(["aaaaaaaa-1"]) }, 0],
    ["relay line not tied to Relay fails", { documents: doc([L({ card: "relay" })]), live: [R()] }, 1],
    ["relay sum equals paid passes", { documents: doc([L({ card: "relay" })]), live: [R({ relay_id: "r1" })], relayTotals: new Map([["r1", { paid_cents: 5000, dead: false }]]) }, 0],
    ["relay sum differs fails", { documents: doc([L({ card: "relay" })]), live: [R({ relay_id: "r1" })], relayTotals: new Map([["r1", { paid_cents: 4000, dead: false }]]) }, 1],
    ["relay txn voided fails", { documents: doc([L({ card: "relay" })]), live: [R({ relay_id: "r1" })], relayTotals: new Map([["r1", { paid_cents: 5000, dead: true }]]) }, 1],
    ["relay txn absent fails", { documents: doc([L({ card: "relay" })]), live: [R({ relay_id: "r1" })] }, 1],
    ["receipt printed on two documents, live once on the other load = already on load N",
      { documents: [{ settlement_no: "1", fuel_purchases: [L()] }, { settlement_no: "2", fuel_purchases: [L({ load_number: "200" })] }], live: [R()] }, 0],
    ["the second document prints the suffixed number <invoice>-<load>: still already on load N",
      { documents: [{ settlement_no: "1", fuel_purchases: [L()] }, { settlement_no: "2", fuel_purchases: [L({ load_number: "13621", invoice: "A1-13621" })] }], live: [R()] }, 0],
    ["a listed second entry with a different amount is shown while the kept line is live",
      { documents: [{ settlement_no: "2", fuel_purchases: [L({ load_number: "13535", invoice: "A1-13535", receipt_cents: 4135, fuel_type: "def" })] }],
        documentDuplicates: [{ load_number: "13535", invoice: "A1-13535", receipt_cents: 4135, fuel_type: "def", kept_on_load: "100", kept_invoice: "A1" }],
        live: [R({ fuel_type: "def" })] }, 1],
    ["receipt printed on two documents, live on neither load fails twice",
      { documents: [{ settlement_no: "1", fuel_purchases: [L()] }, { settlement_no: "2", fuel_purchases: [L({ load_number: "200" })] }], live: [] }, 2],
    // 443.198 — the Dreamline statement source.
    ["statement-sourced fill on a documented load passes and stays out of the tie",
      { documents: doc([L()]), live: [R(), R({ id: "ssssssss-1", ref: "61620", cents: 2533 })], statementIds: new Set(["ssssssss-1"]),
        statementBatches: [{ event_id: "e1", at: "t", declared_lines: 1, rows: 1 }] }, 0],
    ["statement-sourced fill on an undocumented load passes",
      { documents: doc([]), live: [R({ id: "ssssssss-1", load_number: "200", ref: "03980" })], statementIds: new Set(["ssssssss-1"]) }, 0],
    ["a row the import never wrote (marker not proven) on a documented load still fails",
      { documents: doc([L()]), live: [R(), R({ id: "ssssssss-1", ref: "61620", cents: 2533 })] }, 1],
    ["a row the import never wrote on an undocumented load still fails",
      { documents: doc([]), live: [R({ id: "ssssssss-1", load_number: "200", ref: "03980" })] }, 1],
    ["a statement fill never excuses a missing document line",
      { documents: doc([L()]), live: [R({ id: "ssssssss-1", ref: "61620", cents: 2533 })], statementIds: new Set(["ssssssss-1"]) }, 1],
    ["an import batch that holds more rows than its event declares fails",
      { documents: doc([]), live: [], statementBatches: [{ event_id: "e1", at: "t", declared_lines: 75, rows: 76 }] }, 1],
    // LEAD 443.214: a receipt the fuel engine moved by GPS off the load its settlement printed it on is sourced by that line.
    ["a GPS-moved receipt printed on another load's settlement is sourced (no unsourced on its new load)",
      { documents: doc([L(), L({ load_number: "200", invoice: "B2", receipt_cents: 7000 })]),
        live: [R({ load_number: "200", truck_resolution: "gps" }), R({ id: "bbbbbbbb-2", load_number: "200", ref: "B2", cents: 7000 })] }, 0],
    ["a GPS-moved Relay-sourced fill (on no document) moved onto a documented load is sourced",
      { documents: doc([L({ load_number: "200", invoice: "B2", receipt_cents: 7000 })]),
        live: [R({ load_number: "200", ref: "Z9", cents: 4100, truck_resolution: "gps", relay_id: "r9" }), R({ id: "bbbbbbbb-2", load_number: "200", ref: "B2", cents: 7000 })],
        relayTotals: new Map([["r9", { paid_cents: 4100, dead: false }]]) }, 0],
    ["a GPS-moved fill with no source at all is still unsourced",
      { documents: doc([L({ load_number: "200", invoice: "B2", receipt_cents: 7000 })]),
        live: [R({ load_number: "200", ref: "Z9", cents: 4100, truck_resolution: "gps" }), R({ id: "bbbbbbbb-2", load_number: "200", ref: "B2", cents: 7000 })] }, 1],
    ["the same receipt moved by hand (no engine resolution) is still unsourced on its new load",
      { documents: doc([L(), L({ load_number: "200", invoice: "B2", receipt_cents: 7000 })]),
        live: [R({ load_number: "200" }), R({ id: "bbbbbbbb-2", load_number: "200", ref: "B2", cents: 7000 })] }, 1],
    // ACCT-F11105 — the Relay-at-receipt source (ENG-65) and the other-rail record.
    ["an ENG-65 receipt record on a documented load (marker, own txn id, sum ties) is sourced",
      { documents: doc([L()]), live: [R(), R({ id: "eeeeeeee-1", ref: "txn_X", cents: 2734, relay_id: "rX", notes: "ENG-65: Relay fill recorded at receipt from its own Relay lines" })],
        relayTotals: new Map([["rX", { paid_cents: 2734, dead: false, txn: "txn_X" }]]) }, 0],
    ["planted: the ENG-65 marker on a row whose reference is NOT its fill's transaction id is still unsourced",
      { documents: doc([L()]), live: [R(), R({ id: "eeeeeeee-1", ref: "99671555", cents: 2734, relay_id: "rX", notes: "ENG-65: Relay fill recorded at receipt from its own Relay lines" })],
        relayTotals: new Map([["rX", { paid_cents: 2734, dead: false, txn: "txn_X" }]]) }, 1],
    ["planted: a Relay row WITHOUT the ENG-65 marker on a documented load is still unsourced",
      { documents: doc([L()]), live: [R(), R({ id: "eeeeeeee-1", ref: "txn_X", cents: 2734, relay_id: "rX" })],
        relayTotals: new Map([["rX", { paid_cents: 2734, dead: false, txn: "txn_X" }]]) }, 1],
    ["planted: an ENG-65 record of a purchase another rail already records fails twice (unsourced + two records)",
      { documents: doc([L()]), live: [R(), R({ id: "eeeeeeee-1", ref: "txn_X", cents: 2734, relay_id: "rX", notes: "ENG-65: Relay fill recorded at receipt from its own Relay lines" })],
        relayTotals: new Map([["rX", { paid_cents: 2734, dead: false, txn: "txn_X" }]]),
        otherRailByRelay: new Map([["rX", [{ id: "dddddddd-1", ref: "99671555", card: "DREAMLINE" }]]]) }, 2],
    ["planted: a Creator Relay record on an undocumented load whose purchase another rail records fails",
      { documents: doc([]), live: [R({ load_number: "200", relay_id: "rX", cents: 2734 })], relayTotals: new Map([["rX", { paid_cents: 2734, dead: false, txn: "txn_X" }]]),
        otherRailByRelay: new Map([["rX", [{ id: "dddddddd-1", ref: "99671555", card: "DREAMLINE" }]]]) }, 1],
    // ACCT-F11107 — a receipt voided as a duplicate of a Relay fill.
    ["a line whose row was voided as a duplicate of a live, booked Relay fill is replaced, not missing",
      { documents: doc([L()]), live: [], replacedByRelay: [{ id: "vvvvvvvv-1", load_number: "100", ref: "A1", cents: 5000, relay_txn: "txn_X", booked: true }] }, 0],
    ["planted: the Relay fill it names is not booked -> still fails",
      { documents: doc([L()]), live: [], replacedByRelay: [{ id: "vvvvvvvv-1", load_number: "100", ref: "A1", cents: 5000, relay_txn: "txn_X", booked: false }] }, 1],
    ["planted: a replacement of a different amount does not excuse the line",
      { documents: doc([L()]), live: [], replacedByRelay: [{ id: "vvvvvvvv-1", load_number: "100", ref: "A1", cents: 4999, relay_txn: "txn_X", booked: true }] }, 1],
    ["the same receipt voided on the load that carried it (another load) is replaced",
      { documents: doc([L()]), live: [], replacedByRelay: [{ id: "vvvvvvvv-1", load_number: "200", ref: "A1", cents: 5000, relay_txn: "txn_X", booked: true }] }, 0],
    ["planted: a replacement with another invoice does not excuse the line",
      { documents: doc([L()]), live: [], replacedByRelay: [{ id: "vvvvvvvv-1", load_number: "100", ref: "B2", cents: 5000, relay_txn: "txn_X", booked: true }] }, 1],
    ["planted: one replaced row never excuses two document lines",
      { documents: doc([L(), L({ date: "2026-08-01" })]), live: [], replacedByRelay: [{ id: "vvvvvvvv-1", load_number: "100", ref: "A1", cents: 5000, relay_txn: "txn_X", booked: true }] }, 1],
    ["a statement fill does not excuse a Relay sum that differs",
      { documents: doc([]), live: [R({ id: "ssssssss-1", load_number: "200", relay_id: "r1" })], statementIds: new Set(["ssssssss-1"]),
        relayTotals: new Map([["r1", { paid_cents: 4000, dead: false }]]) }, 1],
  ];
  let bad = 0;
  for (const [name, input, want] of cases) {
    const got = compareFuel(input).failures.length;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name} (${got} failure(s), want ${want})`);
    if (got !== want) bad++;
  }
  // 443.198 — the marker predicate: the import's own marker AND its own invoice, from source 'import', or nothing.
  const N = (o) => ({ source: "import", ref: "61620", notes: "card=…7005; efs_invoice=61620; file_unit=171; 443.142 Dreamline statement", ...o });
  const markerCases = [
    ["import row with marker + own invoice is a statement row", N(), true],
    ["a manual row carrying the marker is not", N({ source: "manual" }), false],
    ["a marker naming another invoice is not", N({ ref: "61621" }), false],
    ["an adopted receipt (dreamline_efs= stamp only) is not", N({ source: "manual", notes: "dreamline_efs=61620:ULSD:1" }), false],
    ["no marker is not", N({ notes: "efs_invoice=61620" }), false],
    // 443.202 — the England WEX rail of the same engine.
    ["a WEX import row with its marker + own wex_invoice is a statement row",
      N({ ref: "93567", notes: "card=…0022; wex_invoice=93567; file_unit=148; 443.202 England WEX statement" }), true],
    ["a WEX marker with the Dreamline invoice key is not",
      N({ ref: "93567", notes: "efs_invoice=93567; 443.202 England WEX statement" }), false],
    ["a WEX marker naming another invoice is not",
      N({ ref: "93568", notes: "wex_invoice=93567; 443.202 England WEX statement" }), false],
  ];
  for (const [name, row, want] of markerCases) {
    const got = statementRowIsImported(row);
    console.log(`${got === want ? "ok  " : "FAIL"} ${name} (${got}, want ${want})`);
    if (got !== want) bad++;
  }
  cases.push(...markerCases);
  // 443.198 — the Creator Relay writer: the real sources pass; origin/main's shape (INSERT at netCents, no engine) fails.
  const realCreator = readOrNull(CREATOR_PATH) ?? "";
  const realEngine = readOrNull(RELAY_ROWS_ENGINE_PATH);
  const oldCreator = realCreator
    .replace(/import \{ writeRelayFillFuelRows, RelayFillFuelRowsError \} from "\.\.\/fuel\/relay-fill-fuel-rows\.js";\n/, "")
    .replace(/relayRowId \? \{ rows: \[\{ id: relayRowId \}\] \} : /, "");
  const writerCases = [
    ["the real Creator + engine pass", creatorRelayRowProblems(realCreator, realEngine).length, 0],
    ["planted: Creator INSERTs the Relay row at the typed amount (origin/main shape) fails", creatorRelayRowProblems(oldCreator, realEngine).length > 0 ? 1 : 0, 1],
    ["planted: engine missing fails", creatorRelayRowProblems(realCreator, null).length > 0 ? 1 : 0, 1],
    ["planted: the writer call moved OUT of the Relay branch fails (443.232 c)",
      creatorRelayRowProblems(realCreator.replace("await writeRelayFillFuelRows(", "await writeRelayFillFuelRowsElsewhere("), realEngine).length > 0 ? 1 : 0, 1],
    ["planted: engine writes a typed amount, not the line fails",
      creatorRelayRowProblems(realCreator, (realEngine ?? "").replace(/p\.total_cents \/ 100/g, "typedCents / 100")).length > 0 ? 1 : 0, 1],
    ["planted: engine without the foot refusal fails",
      creatorRelayRowProblems(realCreator, (realEngine ?? "").replace(/"relay_fill_lines_do_not_foot"/g, '"x"')).length > 0 ? 1 : 0, 1],
  ];
  for (const [name, got, want] of writerCases) {
    console.log(`${got === want ? "ok  " : "FAIL"} ${name} (${got}, want ${want})`);
    if (got !== want) bad++;
  }
  cases.push(...writerCases);
  // ACCT-F11105 — the receipt record's engine: the real sources pass; each planted defect fails.
  const oSrc = readOrNull(OTHER_RAIL_PATH), lSrc = readOrNull("apps/backend/src/fuel/relay-fill-link.service.ts"), wSrc = readOrNull(RECEIPT_WRITER_PATH);
  const receiptCases = [
    ["the real other-rail rule, cross-rail check, ENG-65 refusal and marker pass", receiptRecordProblems(oSrc, lSrc, realEngine, wSrc).length, 0],
    ["planted: cross-rail check without the any-truck ticket rows fails",
      receiptRecordProblems(oSrc, (lSrc ?? "").replace('CROSS JOIN LATERAL (${OTHER_RAIL_TICKET_ROWS_SQL("r")}) q', "q"), realEngine, wSrc).length > 0 ? 1 : 0, 1],
    ["planted: ENG-65 writes without asking the cross-rail check fails",
      receiptRecordProblems(oSrc, lSrc, (realEngine ?? "").replace("await crossRailFuelRowsForRelayFill(", "await Promise.resolve(["), wSrc).length > 0 ? 1 : 0, 1],
    ["planted: the receipt writer's marker changed fails",
      receiptRecordProblems(oSrc, lSrc, realEngine, (wSrc ?? "").replace(RELAY_AT_RECEIPT_MARKER, "ENG-65: recorded")).length > 0 ? 1 : 0, 1],
  ];
  for (const [name, got, want] of receiptCases) {
    console.log(`${got === want ? "ok  " : "FAIL"} ${name} (${got}, want ${want})`);
    if (got !== want) bad++;
  }
  cases.push(...receiptCases);
  console.log(`${LABEL} selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

async function live() {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { exitIfEmptyByPurge } = await import("./lib/purge-window.mjs");
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
  const staticProblems = staticCheck();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // BANK-F30150: one explicit transaction with a transaction-scoped bypass, never a session SET on the pooler.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const liveRes = await client.query(
      // stampDocumentVoided renumbers a voided load VOID-<original>-<id8> (#22442); its documents still name the original.
      `SELECT ft.id::text AS id, ft.transaction_reference AS ref, round(ft.total_cost * 100)::bigint AS cents,
              ft.transaction_at::date::text AS date, ft.fuel_type, ft.relay_fuel_transaction_id::text AS relay_id,
              ft.source, ft.notes, ft.created_at,
              -- 443.214: a Relay fill's rows move together; the engine's resolution on any row of the fill is the fill's.
              COALESCE(ft.truck_resolution,
                       (SELECT max(sib.truck_resolution) FROM fuel.fuel_transactions sib
                         WHERE ft.relay_fuel_transaction_id IS NOT NULL
                           AND sib.relay_fuel_transaction_id = ft.relay_fuel_transaction_id
                           AND sib.operating_company_id = ft.operating_company_id
                           AND sib.truck_resolution IS NOT NULL)) AS truck_resolution,
              regexp_replace(l.load_number, '^VOID-(.+)-[0-9a-f]{8}$', '\\1') AS load_number
         FROM fuel.fuel_transactions ft
         LEFT JOIN mdata.loads l ON l.id = ft.load_id
        WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL AND ft.voided_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const liveRows = liveRes.rows.map((r) => ({ ...r, cents: Number(r.cents) }));
    if (liveRows.length === 0) {
      exitIfEmptyByPurge(LABEL, "fuel.fuel_transactions (USMCA, live)");
      console.error(`${LABEL}: LIVE FAIL — 0 live fuel.fuel_transactions rows for USMCA; an empty result is an instrument claim, not a real zero`);
      process.exit(1);
    }
    const purgedRes = await client.query(
      `SELECT row_data->>'transaction_reference' AS ref, round((row_data->>'total_cost')::numeric * 100)::bigint AS cents, auth_id
         FROM audit.record_deletions
        WHERE table_name = 'fuel.fuel_transactions' AND deletion_route = 'auth_purge' AND auth_id IS NOT NULL
          AND row_data->>'operating_company_id' = $1`,
      [USMCA_COMPANY_ID]
    );
    const relayRes = await client.query(
      `SELECT id::text, transaction_id AS txn, total_amount_paid_cents::bigint AS paid, (voided_at IS NOT NULL OR is_active IS FALSE) AS dead
         FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    // ACCT-F11105 (b) — every Relay fill with live rows whose purchase another rail records, by the engine's own SQL.
    const otherRailSql = otherRailTicketSql(readOrNull(OTHER_RAIL_PATH), "r");
    const otherRailRes = otherRailSql ? await client.query(
      `SELECT r.id::text AS relay_id, q.id::text AS id, q.transaction_reference AS ref,
              (SELECT ct.code FROM catalogs.fuel_card_types ct WHERE ct.id = q.fuel_card_id) AS card
         FROM integrations.relay_fuel_transactions r
         CROSS JOIN LATERAL (${otherRailSql}) q
        WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL
          AND EXISTS (SELECT 1 FROM fuel.fuel_transactions f WHERE f.relay_fuel_transaction_id = r.id
                       AND f.operating_company_id = r.operating_company_id AND f.voided_at IS NULL AND f.archived_at IS NULL)`,
      [USMCA_COMPANY_ID]
    ) : { rows: [] };
    const otherRailByRelay = new Map();
    for (const o of otherRailRes.rows) otherRailByRelay.set(o.relay_id, [...(otherRailByRelay.get(o.relay_id) ?? []), o]);
    // ACCT-F11107 — voided rows the void engine named as a duplicate of a Relay fill (void_reason, or the link column),
    // and whether that fill is live and booked (a live, unreversed fuel_event posting on it).
    const replacedRes = await client.query(
      `SELECT ft.id::text AS id, ft.transaction_reference AS ref, round(ft.total_cost * 100)::bigint AS cents,
              regexp_replace(l.load_number, '^VOID-(.+)-[0-9a-f]{8}$', '\\1') AS load_number,
              r.transaction_id AS relay_txn,
              (r.id IS NOT NULL AND r.voided_at IS NULL AND EXISTS (
                 SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
                  WHERE p.operating_company_id = ft.operating_company_id AND p.source_transaction_type = 'fuel_event'
                    AND p.source_transaction_id = r.id::text AND j.status = 'posted'
                    AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL)) AS booked
         FROM fuel.fuel_transactions ft
         LEFT JOIN mdata.loads l ON l.id = ft.load_id
         LEFT JOIN integrations.relay_fuel_transactions r
           ON r.operating_company_id = ft.operating_company_id
          AND (r.id = ft.relay_fuel_transaction_id
               OR (ft.relay_fuel_transaction_id IS NULL AND r.transaction_id = substring(ft.void_reason from 'Relay (?:fill )?(txn_[A-Za-z0-9]+)')))
        WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NOT NULL
          AND (ft.relay_fuel_transaction_id IS NOT NULL OR ft.void_reason ~ 'Relay (fill )?txn_[A-Za-z0-9]+')`,
      [USMCA_COMPANY_ID]
    );
    const creatorRes = await client.query(
      `SELECT DISTINCT jsonb_array_elements_text(payload->'fuel_transaction_ids') AS id
         FROM audit.audit_events
        WHERE event_class = 'driver_finance.settlement_creator.posted' AND payload->>'operating_company_id' = $1
          AND jsonb_typeof(payload->'fuel_transaction_ids') = 'array'`,
      [USMCA_COMPANY_ID]
    );
    // 443.198 — the Dreamline statement import's own record: each import event, and every row (live AND voided) that
    // carries the import's marker in that event's transaction (created_at = the event's created_at, one transaction).
    const stmtEvents = { rows: [] };
    const railBatchTimes = new Map();
    for (const rail of STATEMENT_RAILS) {
      const ev = await client.query(
        `SELECT ae.uuid::text AS event_id, ae.created_at, ae.created_at::text AS at,
                coalesce((ae.payload->'by_outcome'->'imported'->>'lines')::int, 0) AS declared_lines,
                (SELECT count(*)::int FROM fuel.fuel_transactions ft
                  WHERE ft.operating_company_id = $1::uuid AND ft.created_at = ae.created_at AND ft.source = 'import'
                    AND ft.notes LIKE '%' || $2::text || '%') AS rows
           FROM audit.audit_events ae
          WHERE ae.event_class = $3::text AND ae.payload->>'operating_company_id' = $1::text`,
        [USMCA_COMPANY_ID, rail.marker, rail.event]
      );
      stmtEvents.rows.push(...ev.rows);
      railBatchTimes.set(rail.marker, new Set(ev.rows.map((e) => new Date(e.created_at).toISOString())));
    }
    // A row is statement-sourced only inside ITS rail's batch; a marker on a row no import event of that rail wrote is
    // never a source — and is named, not ignored.
    const inOwnBatch = (r) => STATEMENT_RAILS.some((rail) => String(r.notes ?? "").includes(rail.marker)
      && railBatchTimes.get(rail.marker).has(new Date(r.created_at).toISOString()));
    const strayMarked = liveRows.filter((r) => STATEMENT_RAILS.some((rail) => String(r.notes ?? "").includes(rail.marker)) && !inOwnBatch(r));
    const statementIds = new Set(liveRows.filter((r) => statementRowIsImported(r) && inOwnBatch(r)).map((r) => r.id));
    const result = compareFuel({
      documents: source.documents,
      corrections: source.date_corrections || [],
      documentDuplicates: source.document_duplicates || [],
      live: liveRows,
      purged: purgedRes.rows.map((r) => ({ ...r, cents: Number(r.cents) })),
      relayTotals: new Map(relayRes.rows.map((r) => [r.id, { paid_cents: Number(r.paid), dead: r.dead, txn: r.txn }])),
      otherRailByRelay,
      replacedByRelay: replacedRes.rows.map((r) => ({ ...r, cents: Number(r.cents), booked: r.booked === true })),
      creatorIds: new Set(creatorRes.rows.map((r) => r.id)),
      statementIds,
      statementBatches: stmtEvents.rows.map((e) => ({ event_id: e.event_id, at: e.at, declared_lines: e.declared_lines, rows: e.rows })),
    });
    for (const r of strayMarked) {
      result.failures.push(`statement: live row ${r.id.slice(0, 8)} load ${r.load_number ?? "(none)"} invoice ${r.ref} carries a statement marker but no import event of that rail wrote it`);
    }
    let failures = result.failures.length + staticProblems.length;
    for (const n of result.notes) console.log(`${LABEL}: ${n}`);
    for (const f of result.failures) console.error(`  ✗ ${f}`);

    // 3. DEF GL segregation — every DEF debit posting must hit a DIFFERENT account than any diesel debit posting
    // (dynamic, no hardcoded account). Liveness = je.reversed_by_je_id IS NULL (void posts a reversing JE).
    const defIds = liveRows.filter((r) => r.fuel_type === "def").map((r) => r.id);
    const dieselIds = liveRows.filter((r) => r.fuel_type === "diesel").map((r) => r.id);
    let sharedCount = 0;
    let sharedCents = 0;
    let sharedDetailRows = [];
    if (defIds.length > 0) {
      const glRes = await client.query(
        `SELECT ft.fuel_type, a.id::text AS account_id, a.account_number, a.account_name,
                count(*) AS n, sum(jep.amount_cents) AS cents
           FROM fuel.fuel_transactions ft
           JOIN accounting.journal_entry_postings jep
             ON jep.source_transaction_type = 'fuel_event'
            AND jep.source_transaction_id = ft.id::text
            AND jep.debit_or_credit = 'debit'
           JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           JOIN catalogs.accounts a ON a.id = jep.account_id
          WHERE ft.id = ANY($1::uuid[])
            AND je.status = 'posted'
            AND je.reversed_by_je_id IS NULL
            -- LEAD 443.214: the rule is about the EXPENSE a fill is classified to (DEF never shares the diesel expense account).
            -- A debit on a liability (the card payable) is the payable side of a reversal / reclass — e.g. the fuel engine's
            -- carry of a moved receipt, or a void reversal — not an expense classification.
            AND (a.account_type ILIKE '%expense%' OR a.account_type = 'CostOfGoodsSold')
          GROUP BY ft.fuel_type, a.id, a.account_number, a.account_name`,
        [[...defIds, ...dieselIds]]
      );
      const defAccountIds = new Set(glRes.rows.filter((r) => r.fuel_type === "def").map((r) => r.account_id));
      const dieselAccountIds = new Set(glRes.rows.filter((r) => r.fuel_type === "diesel").map((r) => r.account_id));
      const sharedAccountIds = [...defAccountIds].filter((id) => dieselAccountIds.has(id));
      sharedDetailRows = glRes.rows.filter((r) => sharedAccountIds.includes(r.account_id) && r.fuel_type === "def");
      sharedCount = sharedDetailRows.reduce((s, r) => s + Number(r.n), 0);
      sharedCents = sharedDetailRows.reduce((s, r) => s + Number(r.cents), 0);
    }
    const defBaseline = baseline.def_gl_segregation || null;
    if (sharedCount > 0 && (!defBaseline || sharedCount !== defBaseline.count || sharedCents !== defBaseline.total_cents)) {
      console.error(`${LABEL}: LIVE FAIL — DEF debit postings share an account with diesel debit postings${defBaseline ? ` (diverges from the disclosed ${defBaseline.count} / ${money(defBaseline.total_cents)})` : ""}:`);
      for (const r of sharedDetailRows) console.error(`  ✗ DEF debits hit ${r.account_number} "${r.account_name}" — ${r.n} posting(s), ${money(Number(r.cents))}`);
      failures++;
    } else if (sharedCount === 0 && defBaseline) {
      console.error(`${LABEL}: LIVE FAIL — DEF/diesel segregation is CLEAN but def_gl_segregation is still disclosed in ${path.basename(BASELINE_PATH)} — remove it`);
      failures++;
    }

    // 4. The same receipt (invoice + cents) live on MORE THAN ONE load is a possible double-booked fill. The live set
    // must equal the disclosed cross_load_duplicate_receipts list exactly (a new pair fails; a resolved pair still listed fails).
    const loadsByReceipt = new Map();
    for (const r of liveRows) {
      // 443.73 #6(e) — RULE REPLACED. Old (443.69): keyed on the raw reference, so a copy re-booked as "<invoice>-<load>" was
      // never seen as a pair. New: keyed on the BASE invoice + cents + product — the suffix cannot hide a second expense of the
      // same purchase. Why: 9 lines / $2,906.21 were expensed twice under that suffix (443.72 #4).
      if (!r.load_number || !/^\d{5,}$/.test(baseInvoice(r.ref))) continue;
      const k = `${baseInvoice(r.ref)}|${r.cents}|${r.fuel_type}`;
      if (!loadsByReceipt.has(k)) loadsByReceipt.set(k, new Set());
      loadsByReceipt.get(k).add(r.load_number);
    }
    const liveDupes = [...loadsByReceipt.entries()].filter(([, s]) => s.size > 1).map(([k, s]) => `${k}|${[...s].sort().join(",")}`).sort();
    const disclosed = (baseline.cross_load_duplicate_receipts || []).map((d) => d.key).sort();
    const newDupes = liveDupes.filter((k) => !disclosed.includes(k));
    const resolved = disclosed.filter((k) => !liveDupes.includes(k));
    if (newDupes.length) { console.error(`${LABEL}: LIVE FAIL — receipt(s) live on more than one load, not disclosed: ${newDupes.join("; ")}`); failures++; }
    if (resolved.length) { console.error(`${LABEL}: LIVE FAIL — disclosed duplicate(s) resolved; remove from cross_load_duplicate_receipts: ${resolved.join("; ")}`); failures++; }
    if (liveDupes.length && !newDupes.length && !resolved.length) console.log(`${LABEL}: known, disclosed — ${liveDupes.join("; ")}`);

    await client.query("COMMIT");
    const liveCents = liveRows.reduce((s, r) => s + r.cents, 0);
    const summary = `${source.documents.length} settlement documents, ${result.expectedRows} fuel lines; live ${liveRows.length} rows / ${money(liveCents)}; ` +
      `${result.loadsTied}/${result.loads} loads tie in count and dollars; ${result.statementSourced} card-statement fill(s) (Dreamline + England WEX) sourced to ${stmtEvents.rows.length} import event(s); ` +
      `${result.relayTxns} Relay transactions read against the Relay file; ${result.relayAtReceipt} Relay fill row(s) recorded at receipt (ENG-65) on documented loads, on no document; ` +
      `${otherRailByRelay.size} Relay fill(s) with live rows also recorded on another rail; ` +
      `${purgedRes.rows.length} governed-purge deletions read; DEF shares ${sharedCount} posting(s) with diesel`;
    if (failures > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${failures} failure(s). ${summary}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — ${summary}`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else if (process.argv.includes("--static")) {
    const problems = staticCheck();
    if (problems.length) {
      console.error(`${LABEL}: STATIC FAIL — ${problems.length} problem(s) in the Settlement Creator's Relay record writer`);
      process.exit(1);
    }
    console.log(`${LABEL}: STATIC PASS — the Settlement Creator writes a Relay fill's rows from the fill's own lines (writeRelayFillFuelRows)`);
  }
  else await live();
}
