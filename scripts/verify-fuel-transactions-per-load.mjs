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
 */
export function compareFuel({ documents, corrections = [], documentDuplicates = [], live, purged = [], relayTotals = new Map(), creatorIds = new Set() }) {
  const failures = [];
  const notes = [];
  const fix = new Map(corrections.map((c) => [`${c.load_number}|${c.invoice}|${c.receipt_cents}`, c]));
  const byLoad = new Map();
  for (const r of live) {
    if (!byLoad.has(r.load_number)) byLoad.set(r.load_number, []);
    byLoad.get(r.load_number).push(r);
  }
  const used = new Set();
  const purgedLeft = purged.map((p) => ({ ...p }));
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
      failures.push(`missing: settlement ${doc.settlement_no} load ${load} invoice ${line.invoice} ${money(line.receipt_cents)} ${line.date} has no live fuel row`);
    }
  }
  for (const r of live) {
    const t = perLoad.get(r.load_number);
    if (t) { t.liveN = (t.liveN || 0) + 1; t.liveC = (t.liveC || 0) + r.cents; }
    if (used.has(r.id)) continue;
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
  }
  const relaySums = new Map();
  for (const r of live) if (r.relay_id) relaySums.set(r.relay_id, (relaySums.get(r.relay_id) || 0) + r.cents);
  for (const [rid, sum] of relaySums) {
    const rt = relayTotals.get(rid);
    if (!rt) failures.push(`relay: live rows point at Relay transaction ${rid} which is not in the Relay file`);
    else if (rt.dead) failures.push(`relay: Relay transaction ${rid} is voided/inactive but ${money(sum)} of live fuel rows still point at it`);
    else if (rt.paid_cents !== sum) failures.push(`relay: Relay transaction ${rid} paid ${money(rt.paid_cents)} but its live fuel rows sum to ${money(sum)}`);
  }
  return { failures, notes, expectedRows, loads: perLoad.size, loadsTied, relayTxns: relaySums.size };
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
  ];
  let bad = 0;
  for (const [name, input, want] of cases) {
    const got = compareFuel(input).failures.length;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name} (${got} failure(s), want ${want})`);
    if (got !== want) bad++;
  }
  console.log(`${LABEL} selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

async function live() {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { exitIfEmptyByPurge } = await import("./lib/purge-window.mjs");
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // BANK-F30150: one explicit transaction with a transaction-scoped bypass, never a session SET on the pooler.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const liveRes = await client.query(
      // stampDocumentVoided renumbers a voided load VOID-<original>-<id8> (#22442); its documents still name the original.
      `SELECT ft.id::text AS id, ft.transaction_reference AS ref, round(ft.total_cost * 100)::bigint AS cents,
              ft.transaction_at::date::text AS date, ft.fuel_type, ft.relay_fuel_transaction_id::text AS relay_id,
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
      `SELECT id::text, total_amount_paid_cents::bigint AS paid, (voided_at IS NOT NULL OR is_active IS FALSE) AS dead
         FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    const creatorRes = await client.query(
      `SELECT DISTINCT jsonb_array_elements_text(payload->'fuel_transaction_ids') AS id
         FROM audit.audit_events
        WHERE event_class = 'driver_finance.settlement_creator.posted' AND payload->>'operating_company_id' = $1
          AND jsonb_typeof(payload->'fuel_transaction_ids') = 'array'`,
      [USMCA_COMPANY_ID]
    );
    const result = compareFuel({
      documents: source.documents,
      corrections: source.date_corrections || [],
      documentDuplicates: source.document_duplicates || [],
      live: liveRows,
      purged: purgedRes.rows.map((r) => ({ ...r, cents: Number(r.cents) })),
      relayTotals: new Map(relayRes.rows.map((r) => [r.id, { paid_cents: Number(r.paid), dead: r.dead }])),
      creatorIds: new Set(creatorRes.rows.map((r) => r.id)),
    });
    let failures = result.failures.length;
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
      `${result.loadsTied}/${result.loads} loads tie in count and dollars; ${result.relayTxns} Relay transactions tie to the Relay file; ` +
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
  else await live();
}
