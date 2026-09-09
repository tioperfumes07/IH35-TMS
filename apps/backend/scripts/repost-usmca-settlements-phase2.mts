#!/usr/bin/env node
/**
 * USMCA SETTLEMENT REBUILD — PHASE 2 (REPOST) ORCHESTRATION.
 *
 * Phase 1 (rebuild-usmca-settlements-orchestration.mts, merged #21448/#21453) tears the mis-grouped
 * per-driver settlements down cleanly. Phase 2 (this file) rebuilds them ONE-PER-TOUR from the signed
 * AllwaysTrack documents, so the app's driver settlements match the paper to the penny.
 *
 * SOURCE OF TRUTH (committed, penny-verified by scripts/reconciliation/preview-usmca-settlement-rebuild.mjs):
 *   docs/reconciliation/2026-09-07-usmca/usmca-settlements-from-signed-docs.csv       (28 tour headers)
 *   docs/reconciliation/2026-09-07-usmca/usmca-settlement-lines-from-signed-docs.csv  (per-load lines)
 * Scope = the 28 Faro-era tours 5769-5796 (owner ruling 2026-09-08: the "IH35 Transportation, LLC"
 * doc header is a stale AllwaysTrack label, NOT an entity signal — every Faro-era tour is USMCA).
 *
 * NO NEW GL MATH. Every ledger movement is delegated to the reviewed, live poster
 * closeSettlementPayRun (settlement-payrun-close.service.ts). This orchestration only assembles the
 * settlement header + settlement_lines + the one admin-fee deduction from the signed docs, exactly the
 * rows the normal open->materialize->close pipeline would have produced, then calls close.
 *
 * SIGN / TERM MAPPING (verified live 2026-09-08 against the schema + poster):
 *   earnings   = loaded_pay + empty_pay + flat_rate + additional_pay  -> settlement.gross_pay (header)
 *                AND one line_type='earnings' row per load (carries load_id -> satisfies the poster's
 *                SETTLEMENT_HAS_NO_LOAD_ACTIVITY guard; the JE gross comes from the header gross_pay).
 *   reimbursed = deduction + reimbursement (fuel/scale/toll/lumper) -> line_type='reimbursement', +positive
 *   escrow     = -$25/load in the CSV -> line_type='escrow_contribution' stored +25.00/load (the poster
 *                sums SUM(amount) as a positive magnitude to withhold; live rows are +25.00).
 *   admin_fee  = -$10 in the CSV -> ONE driver_settlement_deductions row, deduction_type='other'
 *                (resolves other_recovery -> 7200 Driver Admin Fee & Chargeback Income; there is no
 *                'admin_fee' deduction_type live).
 *   cash_advance = recovered from the EXISTING driver_advances (restored by Phase 1), capped PER TOUR
 *                via closeSettlementPayRun's B7 loanRecoveryDecision {mode:'partial', partial_cents}.
 *
 * trace_no is auto-assigned by the BEFORE-INSERT trigger trg_assign_trace_no (never set here).
 *
 * SAFETY: closeSettlementPayRun opens its OWN connection (withCurrentUser) — it does NOT join this
 * script's transaction — so there is no rollback preview for the post. This script therefore ONLY runs
 * against an isolated Neon rehearsal branch: assertNotProd() hard-blocks the prod endpoint on BOTH
 * REBUILD_DB_URL (this script's direct pg pool) AND DATABASE_URL (the app pool the poster uses), with no
 * override flag. Prod is posted only after Claude's GO + the owner's yes, through a separate authorized run.
 *
 * Usage (branch only):
 *   REBUILD_DB_URL="postgres://…branch…" DATABASE_URL="postgres://…branch…" \
 *     npx tsx scripts/repost-usmca-settlements-phase2.mts            # posts on the branch, prints tie-out
 *   npx tsx scripts/repost-usmca-settlements-phase2.mts --selftest    # offline CSV derivation + sign checks
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { closeSettlementPayRun } from "../src/driver-finance/settlement-payrun-close.service.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // apps/backend/scripts
const REPO = path.resolve(HERE, "..", "..", ".."); // -> repo root
const DIR = path.join(REPO, "docs/reconciliation/2026-09-07-usmca");
const HEADERS_CSV = path.join(DIR, "usmca-settlements-from-signed-docs.csv");
const LINES_CSV = path.join(DIR, "usmca-settlement-lines-from-signed-docs.csv");

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // system actor used by the rehearsal harness
// Net pay accrues to Driver Net-Pay Clearing (2170, Liability) — records-only, no money moves; the
// actual bank payment is a separate reconciliation step (owner law: "a payment clears a liability").
const PAYMENT_METHOD_ID = "81f95ee0-fb05-4b73-a0b6-867e02ed2117"; // catalogs.payment_methods "Driver Net-Pay Clearing" (USMCA)
const EXPECTED_GRAND_CENTS = 3783087; // $37,830.87 — the 28-tour signed total (preview-verified)

// ── HARD PROD BLOCK (code-level, no override) — mirrors Phase 1's assertNotProd. ────────────────────
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

/** RFC-4180-ish CSV parser (quoted fields w/ embedded commas), same as the preview harness. */
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
/** Normalize a person name for matching (collapse whitespace, upper, strip accents/punct). */
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
  grossCents: number; // salary + additional (header)
  reimbursedCents: number; // header
  deductionsCents: number; // header (escrow + admin + cash_advance, negative)
  adminFeeCents: number; // positive magnitude
  cashAdvanceCents: number; // positive magnitude
  totalDueCents: number; // signed net
};

/** Build the 28 tours from the two CSVs; assert internal consistency (mirrors the preview harness). */
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
      else if (cat === "escrow") d.escrowCount += 1; // one -$25 line per occurrence
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
    // header deductions (negative) == -(escrow + admin + cash_advance)
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

/**
 * Resolve driver names to ids against the DEDUPLICATED universe of drivers actually used in USMCA
 * finance (referenced by a driver_bill or driver_settlement) — NOT the raw mdata.drivers table, which
 * carries duplicate rows and would make a name match ambiguous. Matching is bidirectional token-subset
 * so the signed doc's maternal surname ("HUGO GAYTAN SARABIA" vs DB "HUGO GAYTAN") and the reverse
 * ("LEONEL ANTONIO MORALES" vs DB "…MORALES NOGUEZ") both resolve to exactly one id.
 */
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
  const universe = res.rows.map((r) => ({ id: r.id, tokens: new Set(normName(`${r.first_name ?? ""} ${r.last_name ?? ""}`).split(" ").filter(Boolean)) }));
  const subset = (a: Set<string>, b: Set<string>) => [...a].every((t) => b.has(t));
  const out = new Map<string, string>();
  for (const name of names) {
    const csv = new Set(normName(name).split(" ").filter(Boolean));
    const hits = universe.filter((u) => u.tokens.size > 0 && (subset(u.tokens, csv) || subset(csv, u.tokens)));
    const ids = [...new Set(hits.map((h) => h.id))];
    if (ids.length !== 1) {
      throw new Error(`driver not uniquely resolved: "${name}" -> ${ids.length} match(es) in the USMCA finance-driver universe`);
    }
    out.set(name, ids[0]!);
  }
  return out;
}

/**
 * Feed any in-scope load that has no mdata.loads row yet (owner: "feed all the loads"). These are real
 * delivered loads carried on the signed docs; the app never got a row. We create a minimal delivered
 * row so the settlement earnings line can link (load_activity guard). FK columns (customer/flag/trailer)
 * are seeded from an existing USMCA load template; full hydration (real customer/revenue/dates for the
 * company-settlement + factoring side) is a documented follow-on. trace_no is auto (trigger).
 */
async function ensureLoads(client: pg.PoolClient, loadNumbers: string[]): Promise<string[]> {
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
  for (const ln of missing) {
    await client.query(
      `INSERT INTO mdata.loads
         (operating_company_id, load_number, customer_id, dispatcher_user_id, dispatch_flag_color_id,
          load_trailer_equipment_id, status, is_sample_data)
       VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'delivered_pending_docs',false)`,
      [OPCO, ln, t.cust, ACTOR, t.flag, t.trailer]
    );
  }
  return missing;
}

/**
 * Some drivers already carry `historical_backfill` cash advances (CA-2026-0001..) that the signed docs
 * recover; they reconcile automatically. One driver (Pedro, tour 5772) was OMITTED from that backfill,
 * so his signed $390 advance has nothing to recover and his net comes out $390 high. This seeds the
 * shortfall as the SAME historical_backfill pattern (advance + its driver_liabilities row, status
 * 'active', outstanding=amount) so the repost recovers it and ties. Books start at $0 (owner law), so
 * a historical_backfill advance posts NO disbursement JE — identical to the existing 27. Opt-in via
 * SEED_SIGNED_ADVANCES=1 (owner/checker gate) so nobody silently mints a money record on prod.
 * Per-driver: seed max(0, sum(signed cash_advance) - sum(available recoverable outstanding)).
 */
async function ensureSignedAdvances(client: pg.PoolClient, tours: Tour[], driverIds: Map<string, string>): Promise<{ driver: string; cents: number; display_id: string }[]> {
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
      [OPCO, displayId, driverId, liab.rows[0]!.id, dollars, ACTOR]
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

type TieRow = { doc: string; driver: string; net_cents: number; signed_cents: number; ok: boolean; note: string };

async function main(): Promise<void> {
  const rebuildUrl = process.env.REBUILD_DB_URL || process.env.REHEARSAL_DB_URL;
  if (!rebuildUrl) throw new Error("REBUILD_DB_URL (branch) required");
  assertNotProd("REBUILD_DB_URL", rebuildUrl);
  assertNotProd("DATABASE_URL", process.env.DATABASE_URL); // the poster uses this pool
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set to the SAME branch (closeSettlementPayRun uses the app pool)");

  const tours = buildTours();
  assertToursConsistent(tours);
  console.log(`\n=== USMCA SETTLEMENT REBUILD — PHASE 2 (REPOST) ===`);
  console.log(`tours: ${tours.length}  grand signed: ${fmt(EXPECTED_GRAND_CENTS)}  (internal consistency OK)\n`);

  const pool = new pg.Pool({ connectionString: rebuildUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const tie: TieRow[] = [];
  try {
    // Session-level (is_local=false) so it persists across autocommit statements on this dedicated client.
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
    await client.query("SELECT set_config('app.operating_company_id',$1,false)", [OPCO]);

    // Clean-state precondition: the repost must run on a state with Phase 1 already applied (0 S-2026-*).
    // On prod this holds after the reversal; on a branch, reset_from_parent must fully complete first.
    const pre = await client.query<{ n: string }>(
      `SELECT count(*)::text n FROM driver_finance.driver_settlements
        WHERE operating_company_id=$1::uuid AND display_id LIKE 'S-2026-57%'`,
      [OPCO]
    );
    if (Number(pre.rows[0]!.n) > 0) {
      throw new Error(`clean-state precondition FAILED: ${pre.rows[0]!.n} pre-existing S-2026-* settlement(s). Reset the branch (and wait for ready) or investigate before reposting.`);
    }

    const driverIds = await resolveDriverIds(client, [...new Set(tours.map((t) => t.driverName))]);
    const allLoads = [...new Set(tours.flatMap((t) => t.loadOrder))];
    const seeded = await ensureLoads(client, allLoads);
    if (seeded.length) console.log(`seeded ${seeded.length} missing load(s): ${seeded.join(", ")}`);
    const loadIds = await resolveLoadIds(client, allLoads);

    if (process.env.SEED_SIGNED_ADVANCES === "1") {
      const adv = await ensureSignedAdvances(client, tours, driverIds);
      for (const a of adv) console.log(`seeded signed-doc advance: ${a.display_id} ${a.driver} ${fmt(a.cents)} (historical_backfill)`);
    }

    // Process each driver's tours in chronological order so per-tour partial advance recovery draws the
    // shared driver_advances down oldest-first, tour by tour (never letting tour #1 sweep the whole balance).
    const ordered = [...tours].sort((a, b) => (a.driverName === b.driverName ? a.start.localeCompare(b.start) : a.driverName.localeCompare(b.driverName)));

    for (const t of ordered) {
      const driverId = driverIds.get(t.driverName)!;
      const firstLoad = t.loadOrder[0]!;
      const lastLoad = t.loadOrder[t.loadOrder.length - 1]!;

      // 1) Settlement header — status 'locked' (postable), load_bookended, source_document_ref = 4-digit doc.
      //    trace_no is auto-assigned by trg_assign_trace_no; operating_company_id auto on lines by trigger.
      const ins = await client.query<{ id: string }>(
        `INSERT INTO driver_finance.driver_settlements
           (operating_company_id, display_id, driver_id, period_start, period_end, status, gross_pay,
            settlement_model, source_document_ref, first_load_id, first_load_number, last_load_id,
            last_load_number, locked_at, created_by_user_id, is_sample_data)
         VALUES ($1::uuid,$2,$3::uuid,LEAST($4::date,$5::date),GREATEST($4::date,$5::date),'locked',$6::numeric,'load_bookended',$7,
                 $8::uuid,$9,$10::uuid,$11,now(),$12::uuid,false)
         RETURNING id::text`,
        [OPCO, `S-2026-${t.doc}`, driverId, t.start, t.end, (t.grossCents / 100).toFixed(2), t.doc,
         loadIds.get(firstLoad), firstLoad, loadIds.get(lastLoad), lastLoad, ACTOR]
      );
      const settlementId = ins.rows[0]!.id;

      // 2) settlement_lines — one earnings row per load (carries load_id), reimbursement rows, +25 escrow/load.
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

      // 3) Admin fee -> ONE 'other' deduction (other_recovery -> 7200). Positive cents magnitude.
      if (t.adminFeeCents > 0) {
        await client.query(
          `INSERT INTO driver_finance.driver_settlement_deductions
             (operating_company_id, driver_id, deduction_type, amount_cents, reason, applied_to_settlement_id, status)
           VALUES ($1::uuid,$2::uuid,'other',$3::bigint,$4,$5::uuid,'pending')`,
          [OPCO, driverId, t.adminFeeCents, `Admin fee (tour ${t.doc})`, settlementId]
        );
      }

      // 4) Close through the reviewed poster. Per-tour partial advance recovery cap = this tour's
      //    cash_advance (0 if none). Floor override to 0 so the signed net (which can be low) never blocks.
      const res = await closeSettlementPayRun(
        {
          operatingCompanyId: OPCO,
          settlementId,
          paymentMethodId: PAYMENT_METHOD_ID,
          loanRecoveryDecision: { mode: "partial", partial_cents: t.cashAdvanceCents, decided_by_user_id: ACTOR, reason: `tour ${t.doc} signed cash-advance recovery` },
          overrideFloor: { pct: 0, cents: 0, reason: `AllwaysTrack signed net rebuild tour ${t.doc}` },
        },
        { userId: ACTOR }
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
  } finally {
    client.release();
    await pool.end();
  }

  // ── Tie-out report. ──────────────────────────────────────────────────────────────────────────────
  console.log("doc   driver                            net        signed     ok  detail");
  console.log("----- --------------------------------- ---------- ---------- --- ------------------------------");
  let grand = 0;
  let allOk = true;
  for (const r of tie.sort((a, b) => a.doc.localeCompare(b.doc))) {
    grand += r.net_cents;
    if (!r.ok) allOk = false;
    console.log(`${r.doc} ${r.driver.padEnd(33).slice(0, 33)} ${fmt(r.net_cents).padStart(10)} ${fmt(r.signed_cents).padStart(10)} ${r.ok ? "OK " : "!!!"} ${r.note}`);
  }
  console.log("----------------------------------------------------------------------------------------------");
  console.log(`tours ${tie.length}   grand net ${fmt(grand)}   expected ${fmt(EXPECTED_GRAND_CENTS)}`);
  const grandOk = grand === EXPECTED_GRAND_CENTS && tie.length === tours.length;
  if (allOk && grandOk) {
    console.log(`PHASE 2 REPOST OK — all ${tours.length} tours tie to the signed net to the penny; grand matches.`);
    process.exitCode = 0;
  } else {
    console.log("PHASE 2 REPOST FAIL — see !!! rows; branch is disposable, prod untouched.");
    process.exitCode = 1;
  }
}

/** Offline: derive from CSVs + assert internal consistency + sign mapping. No DB. */
function selftest(): void {
  const tours = buildTours();
  if (tours.length !== 28) throw new Error(`selftest: expected 28 tours, got ${tours.length}`);
  assertToursConsistent(tours);
  // spot-check doc 5772 (Pedro): gross 1481.83 + reimb 15.25 - escrow 100 - admin 10 - adv 390 = 997.08
  const pedro = tours.find((t) => t.doc === "5772");
  if (!pedro) throw new Error("selftest: doc 5772 (Pedro) missing");
  const escrow = [...pedro.perLoad.values()].reduce((s, d) => s + d.escrowCount * 2500, 0);
  const net = pedro.grossCents + pedro.reimbursedCents - escrow - pedro.adminFeeCents - pedro.cashAdvanceCents;
  if (net !== pedro.totalDueCents) throw new Error(`selftest: 5772 net ${fmt(net)} != ${fmt(pedro.totalDueCents)}`);
  console.log(`[repost-usmca-settlements-phase2 --selftest] PASS — 28 tours consistent; grand ${fmt(EXPECTED_GRAND_CENTS)}; 5772 net ${fmt(net)}.`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
