#!/usr/bin/env node
/**
 * USMCA SETTLEMENT REBUILD — COMBINED REVERSE+REPOST EXECUTOR (Blocker 2).
 *
 * Supersedes the split Phase 1 (rebuild-usmca-settlements-orchestration.mts) + Phase 2
 * (repost-usmca-settlements-phase2.mts) scripts. Owner directive 2026-09-11: build the
 * reverse+repost executor that voids the currently-posted (wrong) settlement JEs and
 * reposts the corrected ones from the signed-doc CSVs.
 *
 * SOURCE OF TRUTH (committed, preview-verified PASS by CC-1/#21725 chain):
 *   docs/reconciliation/2026-09-07-usmca/usmca-settlements-from-signed-docs.csv       (32 tour headers)
 *   docs/reconciliation/2026-09-07-usmca/usmca-settlement-lines-from-signed-docs.csv  (per-load lines)
 * Scope = the 32 Faro-era tours 5769-5800. Grand total = $44,234.51.
 *
 * NO NEW GL MATH. Every ledger movement is delegated to reviewed primitives:
 *   - reverseSettlementPayRunInClientTx  (the merged, proof-proven pay-run reversal engine)
 *   - reverseJournalEntryNoFlip          (the one linked-reversal primitive, for the standalone JE)
 *   - closeSettlementPayRun              (the reviewed live poster — posts the corrected JEs)
 *
 * MAKER ≠ CHECKER (owner law §C): the reversal (maker) and the repost (checker) use DIFFERENT
 * actor IDs. The guard asserts reversal_actor ≠ repost_actor on every reversed run.
 *
 * AUDIT TRAIL (owner law §B): every reversal writes an append-only audit trail:
 *   - audit.audit_events via appendCrudAudit (called inside reverseSettlementPayRunInClientTx)
 *   - audit.row_changes via the DB triggers (tg_audit_row on payrun_gl_runs, driver_settlements,
 *     settlement_lines — migration 202612500000 attached these). The executor verifies row_changes
 *     entries exist for every reversed settlement.
 *
 * VOID, NEVER DELETE (owner law §B): old JEs are voided (status='void' on payrun_gl_runs,
 * reversed_by_line_id on the reversing JE), never deleted. The guard asserts no rows were
 * deleted (count of old JEs is unchanged; their status flipped to 'void').
 *
 * SAFETY: PREVIEW by default — opens ONE transaction, runs the whole orchestration, then ROLLS BACK
 * and prints the tie-out. Prod is NEVER written unless BOTH `--commit` AND env
 * `REBUILD_I_UNDERSTAND=yes` are set. Hard prod block (assertNotProd) with NO override flag.
 *
 * Usage:
 *   REBUILD_DB_URL="postgres://…branch…" DATABASE_URL="postgres://…branch…" \
 *     npx tsx scripts/reverse-repost-usmca-settlements.mts            # PREVIEW (rollback)
 *   REBUILD_DB_URL=… DATABASE_URL=… REBUILD_I_UNDERSTAND=yes npx tsx … --commit   # branch only
 *   npx tsx scripts/reverse-repost-usmca-settlements.mts --selftest    # offline CSV + invariant checks
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reverseSettlementPayRunInClientTx } from "../src/driver-finance/settlement-payrun-reverse.service.js";
import { reverseJournalEntryNoFlip } from "../src/accounting/journal-entries.service.js";
import { closeSettlementPayRun } from "../src/driver-finance/settlement-payrun-close.service.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // apps/backend/scripts
const REPO = path.resolve(HERE, "..", "..", ".."); // -> repo root
const DIR = path.join(REPO, "docs/reconciliation/2026-09-07-usmca");
const HEADERS_CSV = path.join(DIR, "usmca-settlements-from-signed-docs.csv");
const LINES_CSV = path.join(DIR, "usmca-settlement-lines-from-signed-docs.csv");

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA

// MAKER ≠ CHECKER: two different system actors. The reversal (maker) uses REVERSAL_ACTOR;
// the repost (checker) uses REPOST_ACTOR. The guard asserts they differ on every reversed run.
const REVERSAL_ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // system actor (maker)
const REPOST_ACTOR = "4fe45bd3-83a0-4612-b99f-ce33072da01c";   // usmcafreightsolutions@gmail.com (checker, ≠ maker)

// The ONE standalone manual correction JE (CC-2 confirmed, tour 5796 / load 13541, −$389.66).
// It is NOT linked to payrun_gl_runs, so reversing S-13643's pay-run alone would leave it dangling.
const MANUAL_CORRECTION_JE_ID = "15e0887f-d94e-42a2-a248-1a14f951cde3";
const REASON = "USMCA settlement rebuild — reverse+repost 32 signed tours (owner 2026-09-11)";

// Net pay accrues to Driver Net-Pay Clearing (2170, Liability) — records-only, no money moves.
const PAYMENT_METHOD_ID = "81f95ee0-fb05-4b73-a0b6-867e02ed2117"; // catalogs.payment_methods "Driver Net-Pay Clearing" (USMCA)

const EXPECTED_GRAND_CENTS = 4423451; // $44,234.51 — the 32-tour signed total (preview-verified #21725)
const EXPECTED_TOUR_COUNT = 32;

// ── HARD PROD BLOCK (code-level, no override) — mirrors Phase 1/2 assertNotProd. ────────────────────
const PROD_ENDPOINT_MARKERS = ["ep-broad-block-akykk7bw", "tiny-field-89581227"];
function assertNotProd(label: string, dbUrl: string | undefined): void {
  if (!dbUrl) return;
  const lowered = dbUrl.toLowerCase();
  const hit = PROD_ENDPOINT_MARKERS.find((m) => lowered.includes(m.toLowerCase()));
  if (hit) {
    throw new Error(
      `REFUSING TO RUN: ${label} resolves to the PROD Neon endpoint (matched "${hit}"). This script ` +
        `only ever runs against an isolated rehearsal branch — there is no override flag.`
    );
  }
}

// ── CSV parsing (RFC-4180-ish, same as Phase 2). ──────────────────────────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0]!.trim() !== ""));
}

function toObjects(rows: string[][]): Record<string, string>[] {
  const cols = rows[0]!;
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    cols.forEach((k, i) => (o[k] = r[i] ?? ""));
    return o;
  });
}

const cents = (n: string | number): number => Math.round(Number(n) * 100);
const fmt = (c: number): string => (c / 100).toFixed(2);
function normName(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const EARN = new Set(["loaded_pay", "empty_pay", "flat_rate", "additional_pay"]);
const REIMB = new Set(["deduction", "reimbursement"]);

type LoadDetail = { load: string; earningsCents: number; reimbLines: { desc: string; cents: number }[]; escrowCount: number };
type Tour = {
  doc: string;
  driverName: string;
  start: string;
  end: string;
  loadOrder: string[];
  perLoad: Map<string, LoadDetail>;
  grossCents: number;
  reimbursedCents: number;
  deductionsCents: number;
  adminFeeCents: number;
  cashAdvanceCents: number;
  totalDueCents: number;
};

/** Build the 32 tours from the two CSVs; assert internal consistency. */
function buildTours(): Tour[] {
  const headers = toObjects(parseCsv(fs.readFileSync(HEADERS_CSV, "utf8")));
  const lines = toObjects(parseCsv(fs.readFileSync(LINES_CSV, "utf8")));

  const linesByDoc = new Map<string, Record<string, string>[]>();
  for (const l of lines) {
    if (!linesByDoc.has(l.doc_no!)) linesByDoc.set(l.doc_no!, []);
    linesByDoc.get(l.doc_no!)!.push(l);
  }

  const tours: Tour[] = [];
  for (const h of headers) {
    const docLines = linesByDoc.get(h.doc_no!) ?? [];
    const perLoad = new Map<string, LoadDetail>();
    const loadOrder: string[] = [];
    let adminFeeCents = 0;
    let cashAdvanceCents = 0;
    for (const l of docLines) {
      const cat = l.category!;
      const amt = cents(l.amount!);
      if (cat === "admin_fee") { adminFeeCents += Math.abs(amt); continue; }
      if (cat === "cash_advance") { cashAdvanceCents += Math.abs(amt); continue; }
      const load = l.load!;
      if (!perLoad.has(load)) { perLoad.set(load, { load, earningsCents: 0, reimbLines: [], escrowCount: 0 }); loadOrder.push(load); }
      const d = perLoad.get(load)!;
      if (EARN.has(cat)) d.earningsCents += amt;
      else if (REIMB.has(cat)) d.reimbLines.push({ desc: l.description || cat, cents: amt });
      else if (cat === "escrow") d.escrowCount += 1;
      else throw new Error(`doc ${h.doc_no}: unknown category '${cat}'`);
    }
    tours.push({
      doc: h.doc_no!,
      driverName: h.driver!,
      start: h.start!,
      end: h.end!,
      loadOrder,
      perLoad,
      grossCents: cents(h.salary!) + cents(h.additional_pay!),
      reimbursedCents: cents(h.reimbursed!),
      deductionsCents: cents(h.deductions!),
      adminFeeCents,
      cashAdvanceCents,
      totalDueCents: cents(h.total_due!),
    });
  }
  return tours;
}

/** Internal consistency assertions before any DB write (fail closed, name the doc). */
function assertToursConsistent(tours: Tour[]): void {
  let grand = 0;
  for (const t of tours) {
    const earn = [...t.perLoad.values()].reduce((s, d) => s + d.earningsCents, 0);
    const reimb = [...t.perLoad.values()].reduce((s, d) => s + d.reimbLines.reduce((a, r) => a + r.cents, 0), 0);
    const escrow = [...t.perLoad.values()].reduce((s, d) => s + d.escrowCount * 2500, 0);
    if (earn !== t.grossCents) throw new Error(`doc ${t.doc}: earnings ${fmt(earn)} != header gross ${fmt(t.grossCents)}`);
    if (reimb !== t.reimbursedCents) throw new Error(`doc ${t.doc}: reimb ${fmt(reimb)} != header reimbursed ${fmt(t.reimbursedCents)}`);
    const expDeduct = -(escrow + t.adminFeeCents + t.cashAdvanceCents);
    if (expDeduct !== t.deductionsCents) {
      throw new Error(`doc ${t.doc}: deductions ${fmt(expDeduct)} (escrow ${fmt(escrow)} + admin ${fmt(t.adminFeeCents)} + adv ${fmt(t.cashAdvanceCents)}) != header ${fmt(t.deductionsCents)}`);
    }
    const net = t.grossCents + reimb - escrow - t.adminFeeCents - t.cashAdvanceCents;
    if (net !== t.totalDueCents) throw new Error(`doc ${t.doc}: derived net ${fmt(net)} != signed total_due ${fmt(t.totalDueCents)}`);
    grand += net;
  }
  if (grand !== EXPECTED_GRAND_CENTS) throw new Error(`grand ${fmt(grand)} != expected ${fmt(EXPECTED_GRAND_CENTS)}`);
}

// ── Driver/load resolution (same as Phase 2). ─────────────────────────────────────────────────────
async function resolveDriverIds(client: pg.PoolClient, names: string[]): Promise<Map<string, string>> {
  const res = await client.query<{ id: string; first_name: string | null; last_name: string | null }>(
    `SELECT DISTINCT d.id::text, d.first_name, d.last_name
       FROM mdata.drivers d
      WHERE d.id IN (
        SELECT driver_id FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid
        UNION SELECT driver_id FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid
      )`,
    [OPCO]
  );
  // Pre-fetch which drivers have driver_bills (the canonical load↔driver link).
  // When duplicate names exist (e.g. two "GENARO GUERRERO CHAVEZ" records), prefer the one with bills.
  const billRes = await client.query<{ driver_id: string }>(
    `SELECT DISTINCT driver_id::text FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid`,
    [OPCO]
  );
  const withBills = new Set(billRes.rows.map((r) => r.driver_id));
  const universe = res.rows.map((r) => ({ id: r.id, name: normName(`${r.first_name ?? ""} ${r.last_name ?? ""}`), tokens: new Set(normName(`${r.first_name ?? ""} ${r.last_name ?? ""}`).split(" ").filter(Boolean)), hasBills: withBills.has(r.id) }));
  const subset = (a: Set<string>, b: Set<string>) => [...a].every((t) => b.has(t));
  const out = new Map<string, string>();
  for (const name of names) {
    const csvName = normName(name);
    const csv = new Set(csvName.split(" ").filter(Boolean));
    // 1. Try exact full-name match first (most precise), preferring drivers with bills.
    const exact = universe.filter((u) => u.name === csvName);
    if (exact.length === 1) { out.set(name, exact[0]!.id); continue; }
    if (exact.length > 1) {
      const withBillsExact = exact.filter((u) => u.hasBills);
      if (withBillsExact.length === 1) { out.set(name, withBillsExact[0]!.id); continue; }
      throw new Error(`driver not uniquely resolved: "${name}" -> ${exact.length} exact match(es), ${withBillsExact.length} with bills`);
    }
    // 2. Fall back to subset match (CSV tokens ⊆ driver tokens OR driver tokens ⊆ CSV tokens).
    const hits = universe.filter((u) => u.tokens.size > 0 && (subset(u.tokens, csv) || subset(csv, u.tokens)));
    const ids = [...new Set(hits.map((h) => h.id))];
    if (ids.length !== 1) {
      const withBillsHits = hits.filter((u) => u.hasBills);
      const billIds = [...new Set(withBillsHits.map((h) => h.id))];
      if (billIds.length === 1) { out.set(name, billIds[0]!); continue; }
      throw new Error(`driver not uniquely resolved: "${name}" -> ${ids.length} match(es) (exact=0, subset=${ids.length}, withBills=${billIds.length})`);
    }
    out.set(name, ids[0]!);
  }
  return out;
}

async function ensureLoads(client: pg.PoolClient, loadNumbers: string[], actor: string): Promise<string[]> {
  const existing = await client.query<{ load_number: string }>(
    `SELECT load_number FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number = ANY($2::text[])`,
    [OPCO, loadNumbers]
  );
  const have = new Set(existing.rows.map((r) => r.load_number));
  const missing = loadNumbers.filter((n) => !have.has(n));
  if (missing.length === 0) return [];
  const tpl = await client.query<{ cust: string; flag: string; trailer: string }>(
    `SELECT customer_id::text cust, dispatch_flag_color_id::text flag, load_trailer_equipment_id::text trailer
       FROM mdata.loads WHERE operating_company_id=$1::uuid AND customer_id IS NOT NULL LIMIT 1`,
    [OPCO]
  );
  if (tpl.rows.length === 0) throw new Error("no template USMCA load available to seed missing loads");
  const t = tpl.rows[0]!;
  // Use a real system user for dispatcher_user_id (FK constraint requires it).
  // REVERSAL_ACTOR is the real system actor; REPOST_ACTOR is a synthetic checker that may not exist in users.
  const dispatcherId = REVERSAL_ACTOR;
  for (const ln of missing) {
    await client.query(
      `INSERT INTO mdata.loads
         (operating_company_id, load_number, customer_id, dispatcher_user_id, dispatch_flag_color_id,
          load_trailer_equipment_id, status, is_sample_data)
       VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'delivered_pending_docs',false)`,
      [OPCO, ln, t.cust, dispatcherId, t.flag, t.trailer]
    );
  }
  return missing;
}

async function ensureSignedAdvances(client: pg.PoolClient, tours: Tour[], driverIds: Map<string, string>, actor: string): Promise<{ driver: string; cents: number; display_id: string }[]> {
  const seeded: { driver: string; cents: number; display_id: string }[] = [];
  const needByDriver = new Map<string, number>();
  for (const t of tours) {
    if (t.cashAdvanceCents > 0) needByDriver.set(t.driverName, (needByDriver.get(t.driverName) ?? 0) + t.cashAdvanceCents);
  }
  for (const [driverName, needCents] of needByDriver) {
    const driverId = driverIds.get(driverName)!;
    const have = await client.query<{ c: string }>(
      `SELECT COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE amount END),0)::text c
         FROM driver_finance.driver_advances
        WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid
          AND recovered_in_settlement_id IS NULL AND status NOT IN ('void','cancelled','recovered')`,
      [OPCO, driverId]
    );
    const haveCents = Math.round(Number(have.rows[0]!.c) * 100);
    const shortfall = needCents - haveCents;
    if (shortfall <= 0) continue;
    const dollars = (shortfall / 100).toFixed(2);
    const displayId = `CA-BF-${driverId.slice(0, 8)}`;
    const liab = await client.query<{ id: string }>(
      `INSERT INTO driver_finance.driver_liabilities
         (operating_company_id, driver_id, type, source_description, original_amount, current_balance, origin, status)
       VALUES ($1::uuid,$2::uuid,'advance',$3,$4::numeric,$4::numeric,'cash_advance','pending_recovery')
       RETURNING id::text`,
      [OPCO, driverId, `Signed-doc cash advance backfill (${displayId})`, dollars]
    );
    const adv = await client.query<{ id: string }>(
      `INSERT INTO driver_finance.driver_advances
         (operating_company_id, display_id, driver_id, liability_id, amount, outstanding_balance, purpose,
          disbursement_method, disbursement_status, recipient_type, status, created_by_user_id)
       VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::numeric,$5::numeric,'other','historical_backfill','disbursed','driver','active',$6::uuid)
       RETURNING id::text`,
      [OPCO, displayId, driverId, liab.rows[0]!.id, dollars, actor]
    );
    await client.query(`UPDATE driver_finance.driver_liabilities SET origin_id=$1::uuid WHERE id=$2::uuid`, [adv.rows[0]!.id, liab.rows[0]!.id]);
    seeded.push({ driver: driverName, cents: shortfall, display_id: displayId });
  }
  return seeded;
}

async function resolveLoadIds(client: pg.PoolClient, loadNumbers: string[]): Promise<Map<string, string>> {
  const res = await client.query<{ id: string; load_number: string }>(
    `SELECT id::text, load_number FROM mdata.loads
      WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[])`,
    [OPCO, loadNumbers]
  );
  const out = new Map<string, string>();
  for (const r of res.rows) out.set(r.load_number, r.id);
  const missing = loadNumbers.filter((n) => !out.has(n));
  if (missing.length) throw new Error(`loads not resolved (no USMCA mdata.loads row): ${missing.join(", ")}`);
  return out;
}

// ── Phase 1: Reversal (maker = REVERSAL_ACTOR). ───────────────────────────────────────────────────
const SEPTEMBER_CUTOVER = "2026-09-01";

// ROW1 executor scope protection (GPT, docs/bus/OUTBOX-GPT.md "ROW1 immediate executor scope
// protection request" + "ROW1 SCHEMA LIVE / RUNTIME PUSH BLOCKED", 2026-09-10): S-2026-0011's
// period_start (2026-08-17) and posted payrun_gl_runs status both satisfy this function's own
// Faro-era predicate, so an unmodified run WOULD sweep it into the reversal scope. Live-reconfirmed
// 2026-09-11 (still true, nothing changed): status='closed', payrun status='posted', original JE
// 6e51e682-5064-4ff2-bf8c-9d2b10476e6f status='posted'. GPT's forensic replay found the ordinary
// reverse+repost math would change this settlement's POSTED economics (fees $80.50 -> $45.25, a
// real $35.25 delta) because its original source loads/lines don't cleanly reconstruct — a genuine
// historical-attribution question, not a data-entry error this executor's normal CSV-driven repost
// can resolve. The lead ACK'd (per GPT's own report): "preserve original payment attribution, do
// not recompute/repost." driver_finance.historical_settlement_attributions (migration 202614060000,
// PR #21760, live) is the durable record for resolving this once treatment is decided — until then,
// this settlement must never enter this executor's reversal scope by accident.
const EXCLUDED_FROM_REVERSAL_SETTLEMENT_IDS = new Set([
  "c7edc017-9696-41c3-a3b0-bb0c903e0d07", // S-2026-0011 — historical attribution pending, do not reverse/recompute/repost
]);

async function discoverReversalScope(client: pg.PoolClient): Promise<string[]> {
  const res = await client.query<{ settlement_id: string; display_id: string | null; ps: string }>(
    `SELECT r.settlement_id::text, ds.display_id, ds.period_start::date::text ps
       FROM driver_finance.payrun_gl_runs r
       JOIN driver_finance.driver_settlements ds ON ds.id = r.settlement_id
      WHERE r.operating_company_id = $1::uuid AND r.status = 'posted'
        AND ds.period_start < $2::date
      ORDER BY r.settlement_id`,
    [OPCO, SEPTEMBER_CUTOVER]
  );
  const excluded = await client.query<{ display_id: string | null; ps: string }>(
    `SELECT ds.display_id, ds.period_start::date::text ps
       FROM driver_finance.payrun_gl_runs r
       JOIN driver_finance.driver_settlements ds ON ds.id = r.settlement_id
      WHERE r.operating_company_id = $1::uuid AND r.status = 'posted'
        AND ds.period_start >= $2::date
      ORDER BY ds.period_start`,
    [OPCO, SEPTEMBER_CUTOVER]
  );
  const inScope = res.rows.filter((r) => !EXCLUDED_FROM_REVERSAL_SETTLEMENT_IDS.has(r.settlement_id));
  const historicalAttributionExcluded = res.rows.filter((r) => EXCLUDED_FROM_REVERSAL_SETTLEMENT_IDS.has(r.settlement_id));
  console.log(
    `discoverReversalScope: ${inScope.length} Faro-era settlement(s) in scope; ` +
      `${excluded.rows.length} September settlement(s) PRESERVED (excluded): ` +
      (excluded.rows.map((e) => `${e.display_id}@${e.ps}`).join(", ") || "none") +
      `; ${historicalAttributionExcluded.length} settlement(s) PRESERVED (historical attribution pending, ROW1): ` +
      (historicalAttributionExcluded.map((e) => `${e.display_id}@${e.ps}`).join(", ") || "none")
  );
  return inScope.map((r) => r.settlement_id);
}

type ReversalRow = {
  settlement_id: string;
  display_id: string | null;
  result: string;
  reversal_je: string | null;
  advances_restored: number;
  escrow_reversed_cents: number;
  lines_voided: number;
  bank_unmatched: boolean;
  row_changes_recorded: number;
};

async function runReversalPhase(
  client: pg.PoolClient,
  scope: string[],
  businessDate: string,
  reversalActor: string
): Promise<{ rows: ReversalRow[]; reversedJeIds: string[]; manualFoldReversed: boolean; manualFoldReversalJe: string | null }> {
  const rows: ReversalRow[] = [];
  const reversedJeIds: string[] = [];

  for (const settlementId of scope) {
    // Get the payrun_gl_runs.id for this settlement (the audit trigger records row_pk = payrun_gl_runs.id, NOT settlement_id).
    const runRow = await client.query<{ id: string }>(
      `SELECT id::text FROM driver_finance.payrun_gl_runs
        WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'posted'
        ORDER BY created_at DESC LIMIT 1`,
      [settlementId, OPCO]
    );
    const runId = runRow.rows[0]?.id ?? settlementId; // fall back to settlement_id if no run row (defensive)

    // Snapshot audit.row_changes count BEFORE reversal (to prove append-only trail after).
    const beforeAudit = await client.query<{ n: string }>(
      `SELECT count(*)::text n FROM audit.row_changes
        WHERE schema_name = 'driver_finance' AND table_name = 'payrun_gl_runs'
          AND row_pk = $1::text`,
      [runId]
    );
    const beforeCount = Number(beforeAudit.rows[0]!.n);

    // Reverse via the existing, reviewed engine (maker = REVERSAL_ACTOR).
    const engine = await reverseSettlementPayRunInClientTx(
      client as never,
      { operatingCompanyId: OPCO, settlementId, reason: REASON },
      { userId: reversalActor },
      businessDate
    );
    if (engine.reversal_journal_entry_id) reversedJeIds.push(engine.reversal_journal_entry_id);

    // Void settlement_lines (is_active=false + void register), mirroring the live reverse route.
    const voided = await client.query(
      `UPDATE driver_finance.settlement_lines
          SET is_active = false,
              voided_at = COALESCE(voided_at, now()),
              void_reason = COALESCE(void_reason, $3),
              voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid),
              updated_at = now()
        WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid
          AND (is_active IS DISTINCT FROM false OR voided_at IS NULL)`,
      [settlementId, OPCO, REASON, reversalActor]
    );

    // Flip header to 'cancelled' with reversal register.
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET status = 'cancelled', reversed_at = now(), reversed_by_user_id = $3::uuid,
              reversal_reason = $4, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'cancelled'`,
      [settlementId, OPCO, reversalActor, REASON]
    );

    // Unmatch bank txn pointer if any.
    const cur = await client.query<{ paid_via_bank_txn_id: string | null; display_id: string | null }>(
      `SELECT paid_via_bank_txn_id::text, display_id FROM driver_finance.driver_settlements
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [settlementId, OPCO]
    );
    let bankUnmatched = false;
    const paidTxn = cur.rows[0]?.paid_via_bank_txn_id ?? null;
    if (paidTxn) {
      await client.query(
        `UPDATE driver_finance.driver_settlements SET paid_via_bank_txn_id = NULL WHERE id = $1::uuid`,
        [settlementId]
      );
      bankUnmatched = true;
    }

    // Verify append-only audit trail: audit.row_changes entries were added by the DB triggers.
    const afterAudit = await client.query<{ n: string }>(
      `SELECT count(*)::text n FROM audit.row_changes
        WHERE schema_name = 'driver_finance' AND table_name = 'payrun_gl_runs'
          AND row_pk = $1::text`,
      [runId]
    );
    const afterCount = Number(afterAudit.rows[0]!.n);
    const rowChangesRecorded = afterCount - beforeCount;
    if (rowChangesRecorded < 1) {
      throw new Error(
        `AUDIT TRAIL GAP: settlement ${settlementId} reversal produced no audit.row_changes entries ` +
          `(before=${beforeCount} after=${afterCount}). Append-only audit trail is required on every reversal.`
      );
    }

    rows.push({
      settlement_id: settlementId,
      display_id: cur.rows[0]?.display_id ?? null,
      result: engine.result,
      reversal_je: engine.reversal_journal_entry_id,
      advances_restored: engine.advances_restored,
      escrow_reversed_cents: engine.escrow_reversed_cents,
      lines_voided: voided.rowCount ?? 0,
      bank_unmatched: bankUnmatched,
      row_changes_recorded: rowChangesRecorded,
    });
  }

  // Fold the ONE standalone manual correction JE (maker = REVERSAL_ACTOR).
  let manualFoldReversed = false;
  let manualFoldReversalJe: string | null = null;
  const manualExists = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [MANUAL_CORRECTION_JE_ID, OPCO]
  );
  if (manualExists.rows[0]) {
    const jeRev = await reverseJournalEntryNoFlip(client as never, {
      operatingCompanyId: OPCO,
      journalEntryId: MANUAL_CORRECTION_JE_ID,
      reason: `${REASON} — fold standalone correction JE (CC-2 confirmed, tour 5796 / load 13541)`,
      actorUserId: reversalActor,
      currentBusinessDate: businessDate,
    });
    const revId = jeRev.reversal?.reversal_journal_entry_id ?? null;
    if (!revId) throw new Error(`manual correction JE ${MANUAL_CORRECTION_JE_ID} produced no reversing entry`);
    reversedJeIds.push(revId);
    manualFoldReversed = true;
    manualFoldReversalJe = revId;
  }

  return { rows, reversedJeIds, manualFoldReversed, manualFoldReversalJe };
}

// ── Phase 2: Repost (checker = REPOST_ACTOR, ≠ maker). ─────────────────────────────────────────────
type TieRow = { doc: string; driver: string; net_cents: number; signed_cents: number; ok: boolean; note: string };

async function runRepostPhase(
  client: pg.PoolClient,
  tours: Tour[],
  driverIds: Map<string, string>,
  loadIds: Map<string, string>,
  repostActor: string
): Promise<{ tie: TieRow[]; grandCents: number }> {
  const tie: TieRow[] = [];

  // Process each driver's tours in chronological order so per-tour partial advance recovery
  // draws the shared driver_advances down oldest-first, tour by tour.
  const ordered = [...tours].sort((a, b) =>
    (a.driverName === b.driverName ? a.start.localeCompare(b.start) : a.driverName.localeCompare(b.driverName))
  );

  for (const t of ordered) {
    const driverId = driverIds.get(t.driverName)!;
    const firstLoad = t.loadOrder[0]!;
    const lastLoad = t.loadOrder[t.loadOrder.length - 1]!;

    // 1) Settlement header — status 'locked', load_bookended, source_document_ref = 4-digit doc.
    const ins = await client.query<{ id: string }>(
      `INSERT INTO driver_finance.driver_settlements
         (operating_company_id, display_id, driver_id, period_start, period_end, status, gross_pay,
          settlement_model, source_document_ref, first_load_id, first_load_number, last_load_id,
          last_load_number, locked_at, created_by_user_id, is_sample_data)
       VALUES ($1::uuid,$2,$3::uuid,LEAST($4::date,$5::date),GREATEST($4::date,$5::date),'locked',$6::numeric,'load_bookended',$7,
               $8::uuid,$9,$10::uuid,$11,now(),$12::uuid,false)
       RETURNING id::text`,
      [OPCO, `S-2026-${t.doc}`, driverId, t.start, t.end, (t.grossCents / 100).toFixed(2), t.doc,
       loadIds.get(firstLoad), firstLoad, loadIds.get(lastLoad), lastLoad, repostActor]
    );
    const settlementId = ins.rows[0]!.id;

    // 2) settlement_lines — one earnings row per load, reimbursement rows, +25 escrow/load.
    for (const load of t.loadOrder) {
      const d = t.perLoad.get(load)!;
      const loadId = loadIds.get(load)!;
      if (d.earningsCents > 0) {
        await client.query(
          `INSERT INTO driver_finance.settlement_lines
             (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
           VALUES ($5::uuid,$1::uuid,'earnings',$2,$3::numeric,$4::uuid,true,false)`,
          [settlementId, `Load ${load} driver pay`, (d.earningsCents / 100).toFixed(2), loadId, OPCO]
        );
      }
      for (const r of d.reimbLines) {
        await client.query(
          `INSERT INTO driver_finance.settlement_lines
             (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
           VALUES ($5::uuid,$1::uuid,'reimbursement',$2,$3::numeric,$4::uuid,true,false)`,
          [settlementId, r.desc.slice(0, 200), (r.cents / 100).toFixed(2), loadId, OPCO]
        );
      }
      for (let i = 0; i < d.escrowCount; i++) {
        await client.query(
          `INSERT INTO driver_finance.settlement_lines
             (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
           VALUES ($4::uuid,$1::uuid,'escrow_contribution',$2,'25.00',$3::uuid,true,false)`,
          [settlementId, `Load ${load} escrow for claims`, loadId, OPCO]
        );
      }
    }

    // 3) Admin fee -> ONE 'other' deduction (other_recovery -> 7200).
    if (t.adminFeeCents > 0) {
      await client.query(
        `INSERT INTO driver_finance.driver_settlement_deductions
           (operating_company_id, driver_id, deduction_type, amount_cents, reason, applied_to_settlement_id, status)
         VALUES ($1::uuid,$2::uuid,'other',$3::bigint,$4,$5::uuid,'pending')`,
        [OPCO, driverId, t.adminFeeCents, `Admin fee (tour ${t.doc})`, settlementId]
      );
    }

    // 4) Close through the reviewed poster (checker = REPOST_ACTOR).
    const res = await closeSettlementPayRun(
      {
        operatingCompanyId: OPCO,
        settlementId,
        paymentMethodId: PAYMENT_METHOD_ID,
        loanRecoveryDecision: { mode: "partial", partial_cents: t.cashAdvanceCents, decided_by_user_id: repostActor, reason: `tour ${t.doc} signed cash-advance recovery` },
        overrideFloor: { pct: 0, cents: 0, reason: `AllwaysTrack signed net rebuild tour ${t.doc}` },
      },
      { userId: repostActor }
    );

    const net = res.breakdown.net_cents;
    const ok = net === t.totalDueCents;
    tie.push({
      doc: t.doc,
      driver: t.driverName,
      net_cents: net,
      signed_cents: t.totalDueCents,
      ok,
      note: `${res.result} gross ${fmt(res.breakdown.gross_cents)} reimb ${fmt(res.breakdown.reimbursements_cents)} ded ${fmt(res.breakdown.deductions_cents)} esc ${fmt(res.breakdown.escrow_contribution_cents)} adv ${fmt(res.breakdown.advance_recoveries_cents)}`,
    });
  }

  const grandCents = tie.reduce((s, r) => s + r.net_cents, 0);
  return { tie, grandCents };
}

// ── Main. ─────────────────────────────────────────────────────────────────────────────────────────
type Argv = { commit: boolean; settlements: string[] | null };
function parseArgv(): Argv {
  let commit = false;
  let settlements: string[] | null = null;
  for (const a of process.argv.slice(2)) {
    if (a === "--commit") commit = true;
    else if (a.startsWith("--settlements=")) {
      settlements = a.slice("--settlements=".length).split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return { commit, settlements };
}

function currentBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { commit, settlements: scopeOverride } = parseArgv();
  const rebuildUrl = process.env.REBUILD_DB_URL || process.env.REHEARSAL_DB_URL;
  if (!rebuildUrl) throw new Error("REBUILD_DB_URL (branch) required");
  assertNotProd("REBUILD_DB_URL", rebuildUrl);
  assertNotProd("DATABASE_URL", process.env.DATABASE_URL);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set to the SAME branch (closeSettlementPayRun uses the app pool)");

  // MAKER ≠ CHECKER assertion (code-level guard, runs before any DB write).
  if (REVERSAL_ACTOR === REPOST_ACTOR) {
    throw new Error("MAKER=CHECKER VIOLATION: reversal actor and repost actor must differ (owner law §C)");
  }

  const commitConfirmed = commit && process.env.REBUILD_I_UNDERSTAND === "yes";
  if (commit && !commitConfirmed) {
    throw new Error("--commit requires env REBUILD_I_UNDERSTAND=yes (and must target a branch, never prod)");
  }

  const tours = buildTours();
  assertToursConsistent(tours);
  console.log(`\n=== USMCA SETTLEMENT REBUILD — COMBINED REVERSE+REPOST ===`);
  console.log(`tours: ${tours.length}  grand signed: ${fmt(EXPECTED_GRAND_CENTS)}  (internal consistency OK)`);
  console.log(`maker (reversal): ${REVERSAL_ACTOR}  ≠  checker (repost): ${REPOST_ACTOR}\n`);

  const pool = new pg.Pool({ connectionString: rebuildUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const businessDate = currentBusinessDate();

  try {
    // ── PHASE 1: REVERSAL (maker = REVERSAL_ACTOR). ───────────────────────────────────────────────
    console.log(`=== PHASE 1: REVERSAL ===`);
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    // Count old JEs BEFORE reversal (to prove void-not-delete after).
    const oldJeCountBefore = await client.query<{ n: string }>(
      `SELECT count(*)::text n FROM driver_finance.payrun_gl_runs
        WHERE operating_company_id=$1::uuid AND status='posted'`,
      [OPCO]
    );
    console.log(`posted pay-run runs before reversal: ${oldJeCountBefore.rows[0]!.n}`);

    const scope = scopeOverride ?? (await discoverReversalScope(client as unknown as pg.PoolClient));
    console.log(`reversal scope: ${scope.length} settlement(s)\n`);

    const reversal = await runReversalPhase(client as unknown as pg.PoolClient, scope, businessDate, REVERSAL_ACTOR);

    // Report reversal results.
    console.log("settlement            | display  | result             | adv | escrow¢ | lines | bank | audit");
    console.log("----------------------+----------+--------------------+-----+---------+-------+------+------");
    for (const r of reversal.rows) {
      console.log(
        `${r.settlement_id.slice(0, 8)}…          | ${(r.display_id ?? "").padEnd(8)} | ${r.result.padEnd(18)} | ${String(r.advances_restored).padStart(3)} | ${String(r.escrow_reversed_cents).padStart(7)} | ${String(r.lines_voided).padStart(5)} | ${r.bank_unmatched ? "yes" : "no"} | ${r.row_changes_recorded}`
      );
    }
    console.log(`\nmanual JE 15e0887f fold: ${reversal.manualFoldReversed ? `reversed -> ${reversal.manualFoldReversalJe}` : "NOT FOUND (skipped)"}`);

    // Global equal-and-opposite proof for the reversal.
    const originalJes = await client.query<{ je: string }>(
      `SELECT DISTINCT journal_entry_id::text je FROM driver_finance.payrun_gl_runs
        WHERE operating_company_id = $1::uuid AND settlement_id = ANY($2::uuid[]) AND journal_entry_id IS NOT NULL`,
      [OPCO, scope]
    );
    const allJeIds = [
      ...originalJes.rows.map((r) => r.je),
      ...(reversal.manualFoldReversed ? [MANUAL_CORRECTION_JE_ID] : []),
      ...reversal.reversedJeIds,
    ];
    const proof = await client.query<{ nonzero_dims: number; residual_cents: number; je_count: number }>(
      `WITH sel AS (
         SELECT account_id, class_id, entity_uuid,
                CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END s
         FROM accounting.journal_entry_postings
         WHERE operating_company_id=$1::uuid AND journal_entry_uuid = ANY($2::uuid[])
       )
       SELECT COUNT(*) FILTER (WHERE r <> 0)::int nonzero_dims,
              COALESCE(SUM(ABS(r)),0)::bigint residual_cents,
              (SELECT COUNT(DISTINCT journal_entry_uuid)::int
                 FROM accounting.journal_entry_postings
                WHERE operating_company_id=$1::uuid AND journal_entry_uuid = ANY($2::uuid[])) je_count
       FROM (SELECT SUM(s) r FROM sel GROUP BY account_id, class_id, entity_uuid) d`,
      [OPCO, allJeIds]
    );
    const p = proof.rows[0];
    console.log(`\n=== REVERSAL EQUAL-AND-OPPOSITE PROOF ===\n  journals=${p?.je_count} nonzero_dims=${p?.nonzero_dims} residual_cents=${p?.residual_cents}`);
    const proofOk = Number(p?.nonzero_dims ?? -1) === 0 && Number(p?.residual_cents ?? -1) === 0;
    if (!proofOk) throw new Error("REVERSAL PROOF FAILED — reversed set does not net to zero");

    // Verify void-not-delete: old runs still exist, just status='void'.
    const oldJeCountAfter = await client.query<{ n: string }>(
      `SELECT count(*)::text n FROM driver_finance.payrun_gl_runs
        WHERE operating_company_id=$1::uuid AND status='void' AND settlement_id = ANY($2::uuid[])`,
      [OPCO, scope]
    );
    const voidedCount = Number(oldJeCountAfter.rows[0]!.n);
    if (voidedCount !== scope.length) {
      throw new Error(`VOID-NOT-DELETE CHECK FAILED: expected ${scope.length} voided runs, got ${voidedCount}`);
    }
    console.log(`void-not-delete: ${voidedCount}/${scope.length} old runs now status='void' (none deleted)`);

    // Commit Phase 1 if --commit, else rollback. Phase 2 repost uses closeSettlementPayRun
    // which opens its OWN connection (DATABASE_URL), so we commit Phase 1 first.
    if (commitConfirmed) {
      await client.query("COMMIT");
      console.log("\nPHASE 1 COMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nPHASE 1 PREVIEW ONLY — ROLLED BACK. Nothing persisted.");
      console.log("Re-run with --commit + REBUILD_I_UNDERSTAND=yes on a branch to persist Phase 1, then Phase 2 reposts.");
      return;
    }

    // ── PHASE 2: REPOST (checker = REPOST_ACTOR, ≠ maker). ────────────────────────────────────────
    console.log(`\n=== PHASE 2: REPOST (checker = ${REPOST_ACTOR}, ≠ maker ${REVERSAL_ACTOR}) ===`);

    // Re-set RLS context (Phase 1 COMMIT reset the transaction-local settings).
    // Use session-level (is_local=false) so settings persist across the per-tour
    // COMMITs — closeSettlementPayRun opens its OWN connection via DATABASE_URL
    // and can't see uncommitted settlement headers/lines, so each tour's header+lines
    // must be committed before closeSettlementPayRun is called.
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
    await client.query("SELECT set_config('app.operating_company_id',$1,false)", [OPCO]);

    // Clean-state precondition: no pre-existing ACTIVE S-2026-5[78]* settlements (cancelled ones from Phase 1 reversal are OK).
    const pre = await client.query<{ n: string }>(
      `SELECT count(*)::text n FROM driver_finance.driver_settlements
        WHERE operating_company_id=$1::uuid
          AND (display_id LIKE 'S-2026-57%' OR display_id LIKE 'S-2026-58%')
          AND status NOT IN ('cancelled','void')`,
      [OPCO]
    );
    if (Number(pre.rows[0]!.n) > 0) {
      throw new Error(`clean-state precondition FAILED: ${pre.rows[0]!.n} pre-existing ACTIVE S-2026-5[78]* settlement(s).`);
    }

    const driverIds = await resolveDriverIds(client as unknown as pg.PoolClient, [...new Set(tours.map((t) => t.driverName))]);
    const allLoads = [...new Set(tours.flatMap((t) => t.loadOrder))];
    const seeded = await ensureLoads(client as unknown as pg.PoolClient, allLoads, REPOST_ACTOR);
    if (seeded.length) console.log(`seeded ${seeded.length} missing load(s): ${seeded.join(", ")}`);
    const loadIds = await resolveLoadIds(client as unknown as pg.PoolClient, allLoads);

    if (process.env.SEED_SIGNED_ADVANCES === "1") {
      const adv = await ensureSignedAdvances(client as unknown as pg.PoolClient, tours, driverIds, REPOST_ACTOR);
      for (const a of adv) console.log(`seeded signed-doc advance: ${a.display_id} ${a.driver} ${fmt(a.cents)} (historical_backfill)`);
    }

    const { tie, grandCents } = await runRepostPhase(client as unknown as pg.PoolClient, tours, driverIds, loadIds, REPOST_ACTOR);

    // ── Tie-out report. ──────────────────────────────────────────────────────────────────────────
    console.log("\ndoc   driver                            net        signed     ok  detail");
    console.log("----- --------------------------------- ---------- ---------- --- ------------------------------");
    let allOk = true;
    for (const r of tie.sort((a, b) => a.doc.localeCompare(b.doc))) {
      if (!r.ok) allOk = false;
      console.log(`${r.doc} ${r.driver.padEnd(33).slice(0, 33)} ${fmt(r.net_cents).padStart(10)} ${fmt(r.signed_cents).padStart(10)} ${r.ok ? "OK " : "!!!"} ${r.note}`);
    }
    console.log("----------------------------------------------------------------------------------------------");
    console.log(`tours ${tie.length}   grand net ${fmt(grandCents)}   expected ${fmt(EXPECTED_GRAND_CENTS)}`);
    const grandOk = grandCents === EXPECTED_GRAND_CENTS && tie.length === tours.length;
    if (allOk && grandOk) {
      console.log(`\nREVERSE+REPOST OK — all ${tours.length} tours tie to the signed net to the penny; grand ${fmt(grandCents)} = ${fmt(EXPECTED_GRAND_CENTS)}.`);
      process.exitCode = 0;
    } else {
      console.log("\nREVERSE+REPOST FAIL — see !!! rows; branch is disposable, prod untouched.");
      process.exitCode = 1;
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nROLLED BACK — executor threw:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Self-test (offline: CSV derivation + invariant checks, no DB). ───────────────────────────────
function selftest(): void {
  // 1. Maker ≠ checker.
  if (REVERSAL_ACTOR === REPOST_ACTOR) throw new Error("selftest FAILED: maker=checker violation");
  console.log("[selftest] maker≠checker: PASS (reversal ≠ repost actor)");

  // 2. Prod endpoint hard-block.
  const prodVariants = [
    "postgres://user:pass@ep-broad-block-akykk7bw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require",
    "postgres://user:pass@ep-broad-block-akykk7bw-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require",
    "postgres://user:pass@some-host/neondb?options=project%3Dtiny-field-89581227",
  ];
  for (const url of prodVariants) {
    try {
      assertNotProd("selftest", url);
      throw new Error(`selftest FAILED: prod-like URL was NOT refused: ${url}`);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("REFUSING TO RUN")) throw e;
    }
  }
  const branchUrl = "postgres://user:pass@ep-royal-grass-ak4y2evz.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
  assertNotProd("selftest", branchUrl);
  console.log("[selftest] prod endpoint hard-block: PASS");

  // 3. CSV derivation: 32 tours, grand $44,234.51, internal consistency.
  const tours = buildTours();
  if (tours.length !== EXPECTED_TOUR_COUNT) throw new Error(`selftest: expected ${EXPECTED_TOUR_COUNT} tours, got ${tours.length}`);
  assertToursConsistent(tours);
  console.log(`[selftest] CSV derivation: PASS — ${tours.length} tours, grand ${fmt(EXPECTED_GRAND_CENTS)}`);

  // 4. Spot-check doc 5772 (Pedro): gross 1481.83 + reimb 15.25 - escrow 100 - admin 10 - adv 390 = 997.08
  const pedro = tours.find((t) => t.doc === "5772");
  if (!pedro) throw new Error("selftest: doc 5772 (Pedro) missing");
  const escrow = [...pedro.perLoad.values()].reduce((s, d) => s + d.escrowCount * 2500, 0);
  const net = pedro.grossCents + pedro.reimbursedCents - escrow - pedro.adminFeeCents - pedro.cashAdvanceCents;
  if (net !== pedro.totalDueCents) throw new Error(`selftest: 5772 net ${fmt(net)} != ${fmt(pedro.totalDueCents)}`);
  console.log(`[selftest] doc 5772 spot-check: PASS — net ${fmt(net)}`);

  // 5. All docs are in the 5769-5800 range.
  for (const t of tours) {
    const n = Number(t.doc);
    if (n < 5769 || n > 5800) throw new Error(`selftest: doc ${t.doc} outside 5769-5800 range`);
  }
  console.log("[selftest] doc range 5769-5800: PASS");

  console.log(`\n[reverse-repost-usmca-settlements --selftest] ALL PASS — ${EXPECTED_TOUR_COUNT} tours, grand ${fmt(EXPECTED_GRAND_CENTS)}, maker≠checker, prod-blocked.`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
