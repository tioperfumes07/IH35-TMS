#!/usr/bin/env node
/**
 * USMCA SEPTEMBER SETTLEMENTS 5801 / 5802 / 5803 — REVERSE-WRONG + REPOST-CORRECT EXECUTOR.
 *
 * Owner directive 2026-09-11: the three newest AllwaysTrack closed tours (5801/5802/5803) must exist
 * as TRUE posted settlements matching the signed Driver Settlement PDFs to the penny — not the seed's
 * scattered, mis-driver, zero-amount shells. This is the September sibling of CC-1's proven
 * reverse-repost of 5769-5800 (reverse-repost-usmca-settlements.mts) and reuses the SAME reviewed
 * primitives — NO new GL math:
 *   - reverseSettlementPayRunInClientTx  (reverse the ONE posted wrong shell, S-2026-0020, GL-proven)
 *   - closeSettlementPayRun              (the reviewed live poster — posts the corrected 5801/5802/5803)
 *
 * SOURCE OF TRUTH (owner-uploaded AllwaysTrack Driver Settlement PDFs, read 2026-09-11):
 *   5801 CARLOS MAURICIO PENA CARVALLO  09-01..09-10  loads 13570(NB)+13580(SB)  NET 1,334.02
 *   5802 Neftali Coronado Urbano        09-04..09-11  loads 13579(NB)+13589(SB)  NET 2,104.84
 *   5803 Leonel Antonio Morales         09-01..09-11  loads 13564(NB)+13586(SB)  NET 1,624.05
 *   Grand net = 5,062.91.
 *
 * DRIVER RESOLUTION (measured, aligned with CC-1's August canonicalization — never fragment escrow):
 *   Neftali -> a32a35c8 (5770/5793 used it), Leonel -> 5dd518ff (5776/5781/5790 used it),
 *   Carlos  -> 61727a46 (exact PDF-name "PENA CARVALLO"; the a7983a80 "Carlos Carvallo" is the dup).
 *
 * CLEANUP SCOPE (the wrong shells holding these six loads):
 *   S-2026-0020 (Carlos dup, 13570) — GL-POSTED -> full sanctioned pay-run reversal.
 *   S-2026-0018 / 0028 / 0030       — NOT posted -> void lines + cancel header (no GL).
 *   Load 13579 was wrongly CANCELLED under Angel Sosa -> restored to 'invoiced' (it is Neftali's real NB).
 *   All six loads' presettlement_link_id cleared; the corrected tours show their two legs via first/last.
 *
 * MAKER != CHECKER: reversal (maker) uses REVERSAL_ACTOR; repost (checker) uses REPOST_ACTOR.
 *
 * SAFETY: PREVIEW by default — one transaction for reverse+repost, ROLLED BACK, prints the tie-out.
 *   Persist ONLY with `--commit` AND env `SEP_I_UNDERSTAND=yes`. Targets the live USMCA branch via
 *   DATABASE_URL (closeSettlementPayRun uses the app pool).
 *
 * Usage:
 *   DATABASE_URL="postgres://…branch…" npx tsx scripts/build-september-settlements-5801-5803.mts            # PREVIEW
 *   DATABASE_URL=… SEP_I_UNDERSTAND=yes npx tsx scripts/build-september-settlements-5801-5803.mts --commit  # persist
 *   npx tsx scripts/build-september-settlements-5801-5803.mts --selftest                                    # offline net math
 */
import pg from "pg";
import { reverseSettlementPayRunInClientTx } from "../src/driver-finance/settlement-payrun-reverse.service.js";
import { closeSettlementPayRun } from "../src/driver-finance/settlement-payrun-close.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const REVERSAL_ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // maker (tioperfumes07)
const REPOST_ACTOR = "4fe45bd3-83a0-4612-b99f-ce33072da01c";   // checker (usmcafreightsolutions) — != maker
const PAYMENT_METHOD_ID = "81f95ee0-fb05-4b73-a0b6-867e02ed2117"; // Driver Net-Pay Clearing (records-only)
const REASON = "USMCA September 5801-5803 build — match AllwaysTrack signed docs (owner 2026-09-11)";

const cents = (n: number): number => Math.round(n * 100);
const fmt = (c: number): string => (c / 100).toFixed(2);

type Leg = { load: string; earnings: number[]; reimb: number[]; escrow: number; admin: number; advance: number };
type Tour = {
  doc: string; driverId: string; driverName: string; start: string; end: string;
  firstLoad: string; lastLoad: string; legs: Leg[]; expectedNet: number;
};

// ── The three tours, transcribed from the signed Driver Settlement PDFs. ────────────────────────────
const TOURS: Tour[] = [
  {
    doc: "5801", driverId: "61727a46-af2e-4d33-8236-e2d99b737708", driverName: "CARLOS MAURICIO PENA CARVALLO",
    start: "2026-09-01", end: "2026-09-10", firstLoad: "13570", lastLoad: "13580",
    legs: [
      { load: "13570", earnings: [761.85, 25.00, 25.00], reimb: [15.25, 5.25], escrow: 25.00, admin: 0, advance: 200.00 },
      { load: "13580", earnings: [704.97, 41.45], reimb: [15.25], escrow: 25.00, admin: 10.00, advance: 0 },
    ],
    expectedNet: 1334.02,
  },
  {
    doc: "5802", driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", driverName: "Neftali Coronado Urbano",
    start: "2026-09-04", end: "2026-09-11", firstLoad: "13579", lastLoad: "13589",
    legs: [
      { load: "13579", earnings: [945.10, 25.00, 25.00], reimb: [10.00], escrow: 0, admin: 0, advance: 0 },
      { load: "13589", earnings: [794.35, 215.40, 25.00, 25.00, 25.00], reimb: [24.99], escrow: 0, admin: 10.00, advance: 0 },
    ],
    expectedNet: 2104.84,
  },
  {
    doc: "5803", driverId: "5dd518ff-db91-429f-b651-a71b5f0db672", driverName: "Leonel Antonio Morales",
    start: "2026-09-01", end: "2026-09-11", firstLoad: "13564", lastLoad: "13586",
    legs: [
      { load: "13564", earnings: [698.90, 25.00, 25.00, 25.00, 75.00], reimb: [], escrow: 25.00, admin: 0, advance: 0 },
      { load: "13586", earnings: [648.35, 111.80, 25.00, 25.00, 25.00], reimb: [], escrow: 25.00, admin: 10.00, advance: 0 },
    ],
    expectedNet: 1624.05,
  },
];

const EXPECTED_GRAND_CENTS = 506291; // 1334.02 + 2104.84 + 1624.05

function tourGrossCents(t: Tour): number { return t.legs.reduce((s, l) => s + l.earnings.reduce((a, e) => a + cents(e), 0), 0); }
function tourReimbCents(t: Tour): number { return t.legs.reduce((s, l) => s + l.reimb.reduce((a, r) => a + cents(r), 0), 0); }
function tourEscrowCents(t: Tour): number { return t.legs.reduce((s, l) => s + cents(l.escrow), 0); }
function tourAdminCents(t: Tour): number { return t.legs.reduce((s, l) => s + cents(l.admin), 0); }
function tourAdvanceCents(t: Tour): number { return t.legs.reduce((s, l) => s + cents(l.advance), 0); }
function tourNetCents(t: Tour): number {
  return tourGrossCents(t) + tourReimbCents(t) - tourEscrowCents(t) - tourAdminCents(t) - tourAdvanceCents(t);
}

function assertToursConsistent(): void {
  let grand = 0;
  for (const t of TOURS) {
    const net = tourNetCents(t);
    if (net !== cents(t.expectedNet)) {
      throw new Error(`doc ${t.doc}: derived net ${fmt(net)} != signed net ${t.expectedNet.toFixed(2)}`);
    }
    grand += net;
  }
  if (grand !== EXPECTED_GRAND_CENTS) throw new Error(`grand ${fmt(grand)} != expected ${fmt(EXPECTED_GRAND_CENTS)}`);
}

type Db = pg.PoolClient;

// ── Cleanup: reverse the posted wrong shell + cancel the non-posted shells + restore 13579 + unlink. ─
const WRONG_SHELL_DISPLAY_IDS = ["S-2026-0020", "S-2026-0018", "S-2026-0028", "S-2026-0030"];
const TARGET_DISPLAY_IDS = TOURS.map((t) => `S-2026-${t.doc}`); // S-2026-5801/5802/5803
const ALL_LOADS = TOURS.flatMap((t) => t.legs.map((l) => l.load));

/** The canonical S-2026-58NN labels must be free before insert. Abort if one is ACTIVE; retire any
 *  CANCELLED leftover (void-not-delete: the row stays, only its label is tombstoned) so the insert can reuse it. */
async function freeTargetDisplayIds(client: Db): Promise<void> {
  const existing = await client.query<{ id: string; display_id: string; status: string }>(
    `SELECT id::text, display_id, status FROM driver_finance.driver_settlements
      WHERE operating_company_id=$1::uuid AND display_id = ANY($2::text[])`,
    [OPCO, TARGET_DISPLAY_IDS]
  );
  const active = existing.rows.filter((r) => r.status !== "cancelled");
  if (active.length) {
    throw new Error(
      `clean-state precondition FAILED: ${active.length} ACTIVE target settlement(s) already exist: ` +
        active.map((r) => `${r.display_id}(${r.status})`).join(", ") + ". Refusing to double-build."
    );
  }
  for (const r of existing.rows) {
    const tombstone = `${r.display_id}-VOID-${r.id.slice(0, 8)}`;
    await client.query(
      `UPDATE driver_finance.driver_settlements SET display_id=$3, updated_at=now()
        WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
      [r.id, OPCO, tombstone]
    );
    console.log(`cleanup: retired stale cancelled ${r.display_id} -> ${tombstone} (label freed)`);
  }
}

async function cleanupPhase(client: Db, businessDate: string): Promise<void> {
  const shells = await client.query<{ id: string; display_id: string }>(
    `SELECT id::text, display_id FROM driver_finance.driver_settlements
      WHERE operating_company_id=$1::uuid AND display_id = ANY($2::text[])`,
    [OPCO, WRONG_SHELL_DISPLAY_IDS]
  );
  for (const s of shells.rows) {
    // Reverse the GL if posted (returns 'nothing_to_reverse' for the non-posted shells — safe).
    const engine = await reverseSettlementPayRunInClientTx(
      client as never, { operatingCompanyId: OPCO, settlementId: s.id, reason: REASON }, { userId: REVERSAL_ACTOR }, businessDate
    );
    console.log(`cleanup ${s.display_id}: pay-run ${engine.result}${engine.reversal_journal_entry_id ? ` -> ${engine.reversal_journal_entry_id}` : ""}`);
    await client.query(
      `UPDATE driver_finance.settlement_lines SET is_active=false, voided_at=COALESCE(voided_at,now()),
              void_reason=COALESCE(void_reason,$3), voided_by_user_id=COALESCE(voided_by_user_id,$4::uuid), updated_at=now()
        WHERE settlement_id=$1::uuid AND operating_company_id=$2::uuid AND (is_active IS DISTINCT FROM false OR voided_at IS NULL)`,
      [s.id, OPCO, REASON, REVERSAL_ACTOR]
    );
    await client.query(
      `UPDATE driver_finance.driver_settlements SET status='cancelled', reversed_at=now(), reversed_by_user_id=$3::uuid,
              reversal_reason=$4, updated_at=now()
        WHERE id=$1::uuid AND operating_company_id=$2::uuid AND status <> 'cancelled'`,
      [s.id, OPCO, REVERSAL_ACTOR, REASON]
    );
  }
  // 13579 was wrongly cancelled under Angel Sosa — it is Neftali's real delivered NB (AllwaysTrack 5802). Restore.
  await client.query(
    `UPDATE mdata.loads SET status='invoiced', updated_at=now()
      WHERE operating_company_id=$1::uuid AND load_number='13579' AND status='cancelled'`,
    [OPCO]
  );
  // Unlink all six loads so ONLY the corrected tours (first/last bookend) own them.
  const unlinked = await client.query(
    `UPDATE mdata.loads SET presettlement_link_id=NULL, updated_at=now()
      WHERE operating_company_id=$1::uuid AND load_number = ANY($2::text[]) AND presettlement_link_id IS NOT NULL`,
    [OPCO, ALL_LOADS]
  );
  console.log(`cleanup: 13579 restored (if cancelled); ${unlinked.rowCount ?? 0} load link(s) cleared`);
  await freeTargetDisplayIds(client);
}

async function resolveLoadIds(client: Db): Promise<Map<string, string>> {
  const res = await client.query<{ id: string; load_number: string }>(
    `SELECT id::text, load_number FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number = ANY($2::text[])`,
    [OPCO, ALL_LOADS]
  );
  const out = new Map<string, string>();
  for (const r of res.rows) out.set(r.load_number, r.id);
  const missing = ALL_LOADS.filter((n) => !out.has(n));
  if (missing.length) throw new Error(`loads not resolved: ${missing.join(", ")}`);
  return out;
}

async function ensureAdvance(client: Db, driverId: string, needCents: number, tag: string): Promise<void> {
  if (needCents <= 0) return;
  const have = await client.query<{ c: string }>(
    `SELECT COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE amount END),0)::text c
       FROM driver_finance.driver_advances
      WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid
        AND recovered_in_settlement_id IS NULL AND status NOT IN ('void','cancelled','recovered')`,
    [OPCO, driverId]
  );
  const shortfall = needCents - Math.round(Number(have.rows[0]!.c) * 100);
  if (shortfall <= 0) return;
  const dollars = (shortfall / 100).toFixed(2);
  const displayId = `CA-SEP-${driverId.slice(0, 8)}`;
  const liab = await client.query<{ id: string }>(
    `INSERT INTO driver_finance.driver_liabilities
       (operating_company_id, driver_id, type, source_description, original_amount, current_balance, origin, status)
     VALUES ($1::uuid,$2::uuid,'advance',$3,$4::numeric,$4::numeric,'cash_advance','pending_recovery') RETURNING id::text`,
    [OPCO, driverId, `Signed-doc cash advance (${tag})`, dollars]
  );
  const adv = await client.query<{ id: string }>(
    `INSERT INTO driver_finance.driver_advances
       (operating_company_id, display_id, driver_id, liability_id, amount, outstanding_balance, purpose,
        disbursement_method, disbursement_status, recipient_type, status, created_by_user_id)
     VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::numeric,$5::numeric,'other','historical_backfill','disbursed','driver','active',$6::uuid)
     RETURNING id::text`,
    [OPCO, displayId, driverId, liab.rows[0]!.id, dollars, REPOST_ACTOR]
  );
  await client.query(`UPDATE driver_finance.driver_liabilities SET origin_id=$1::uuid WHERE id=$2::uuid`, [adv.rows[0]!.id, liab.rows[0]!.id]);
  console.log(`seeded advance ${displayId} ${tag} ${dollars}`);
}

type Tie = { doc: string; net: number; expected: number; ok: boolean; note: string };

/** Phase A (inside my transaction): seed advances + insert header/lines/deductions. Returns doc -> settlementId. */
async function insertHeadersPhase(client: Db, loadIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const t of TOURS) {
    await ensureAdvance(client, t.driverId, tourAdvanceCents(t), `tour ${t.doc}`);
    const gross = tourGrossCents(t);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO driver_finance.driver_settlements
         (operating_company_id, display_id, driver_id, period_start, period_end, status, gross_pay,
          settlement_model, source_document_ref, first_load_id, first_load_number, last_load_id,
          last_load_number, trip_started_at, trip_closed_at, locked_at, created_by_user_id, is_sample_data)
       VALUES ($1::uuid,$2,$3::uuid,$4::date,$5::date,'locked',$6::numeric,'load_bookended',$7,
               $8::uuid,$9,$10::uuid,$11,$4::timestamptz,$5::timestamptz,now(),$12::uuid,false)
       RETURNING id::text`,
      [OPCO, `S-2026-${t.doc}`, t.driverId, t.start, t.end, (gross / 100).toFixed(2), t.doc,
       loadIds.get(t.firstLoad), t.firstLoad, loadIds.get(t.lastLoad), t.lastLoad, REPOST_ACTOR]
    );
    const settlementId = ins.rows[0]!.id;
    ids.set(t.doc, settlementId);
    for (const leg of t.legs) {
      const loadId = loadIds.get(leg.load)!;
      const earn = leg.earnings.reduce((a, e) => a + cents(e), 0);
      if (earn > 0) {
        await client.query(
          `INSERT INTO driver_finance.settlement_lines
             (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
           VALUES ($5::uuid,$1::uuid,'earnings',$2,$3::numeric,$4::uuid,true,false)`,
          [settlementId, `Load ${leg.load} driver pay`, (earn / 100).toFixed(2), loadId, OPCO]
        );
      }
      for (const r of leg.reimb) {
        await client.query(
          `INSERT INTO driver_finance.settlement_lines
             (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
           VALUES ($5::uuid,$1::uuid,'reimbursement',$2,$3::numeric,$4::uuid,true,false)`,
          [settlementId, `Load ${leg.load} reimbursement`, r.toFixed(2), loadId, OPCO]
        );
      }
      if (leg.escrow > 0) {
        await client.query(
          `INSERT INTO driver_finance.settlement_lines
             (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
           VALUES ($4::uuid,$1::uuid,'escrow_contribution',$2,$3::numeric,$5::uuid,true,false)`,
          [settlementId, `Load ${leg.load} escrow for claims`, leg.escrow.toFixed(2), OPCO, loadId]
        );
      }
      if (leg.admin > 0) {
        await client.query(
          `INSERT INTO driver_finance.driver_settlement_deductions
             (operating_company_id, driver_id, deduction_type, amount_cents, reason, applied_to_settlement_id, status)
           VALUES ($1::uuid,$2::uuid,'other',$3::bigint,$4,$5::uuid,'pending')`,
          [OPCO, t.driverId, cents(leg.admin), `Admin fee (load ${leg.load}, tour ${t.doc})`, settlementId]
        );
      }
    }
  }
  return ids;
}

/** Phase B (each opens its OWN app-pool connection + commits): close through the reviewed poster. */
async function closePhase(ids: Map<string, string>): Promise<Tie[]> {
  const tie: Tie[] = [];
  for (const t of TOURS) {
    const settlementId = ids.get(t.doc)!;
    const res = await closeSettlementPayRun(
      {
        operatingCompanyId: OPCO,
        settlementId,
        paymentMethodId: PAYMENT_METHOD_ID,
        loanRecoveryDecision: { mode: "partial", partial_cents: tourAdvanceCents(t), decided_by_user_id: REPOST_ACTOR, reason: `tour ${t.doc} signed cash-advance recovery` },
        overrideFloor: { pct: 0, cents: 0, reason: `AllwaysTrack signed net rebuild tour ${t.doc}` },
      },
      { userId: REPOST_ACTOR }
    );
    const net = res.breakdown.net_cents;
    const ok = net === cents(t.expectedNet);
    tie.push({
      doc: t.doc, net, expected: cents(t.expectedNet), ok,
      note: `${res.result} gross ${fmt(res.breakdown.gross_cents)} reimb ${fmt(res.breakdown.reimbursements_cents)} ded ${fmt(res.breakdown.deductions_cents)} esc ${fmt(res.breakdown.escrow_contribution_cents)} adv ${fmt(res.breakdown.advance_recoveries_cents)}`,
    });
  }
  return tie;
}

function parseArgv(): { commit: boolean } {
  return { commit: process.argv.includes("--commit") };
}

async function main(): Promise<void> {
  const { commit } = parseArgv();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL (USMCA branch) required");
  if (REVERSAL_ACTOR === REPOST_ACTOR) throw new Error("MAKER=CHECKER violation");
  const commitConfirmed = commit && process.env.SEP_I_UNDERSTAND === "yes";
  if (commit && !commitConfirmed) throw new Error("--commit requires env SEP_I_UNDERSTAND=yes");

  assertToursConsistent();
  console.log(`=== USMCA SEPTEMBER 5801-5803 BUILD ===`);
  console.log(`tours: ${TOURS.length}  grand signed net: ${fmt(EXPECTED_GRAND_CENTS)}  (internal consistency OK)`);
  console.log(`maker(reversal) ${REVERSAL_ACTOR} != checker(repost) ${REPOST_ACTOR}\n`);

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const businessDate = new Date().toISOString().slice(0, 10);
  try {
    // ── PHASE A: cleanup + insert headers/lines (my transaction). ─────────────────────────────────
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    console.log(`=== PHASE A: CLEANUP + INSERT HEADERS (reverse posted 0020 + cancel non-posted shells + restore 13579) ===`);
    await cleanupPhase(client as unknown as Db, businessDate);
    const loadIds = await resolveLoadIds(client as unknown as Db);
    const ids = await insertHeadersPhase(client as unknown as Db, loadIds);
    console.log(`inserted ${ids.size} settlement header(s): ${[...ids.keys()].map((d) => "5" + d.slice(1)).join(", ")}`);

    if (!commitConfirmed) {
      await client.query("ROLLBACK");
      console.log(`\nPREVIEW ONLY — Phase A ROLLED BACK (cleanup + inserts validated). closeSettlementPayRun uses its own pool and CANNOT run against an uncommitted tx, so posting is NOT previewed here.`);
      console.log(`Net math is proven by --selftest. Rehearse end-to-end on a CHILD branch with --commit + SEP_I_UNDERSTAND=yes, verify the tie-out, then run --commit on the live branch.`);
      return;
    }

    await client.query("COMMIT");
    console.log(`PHASE A COMMITTED.`);

    // ── PHASE B: post through the reviewed poster (each close opens its own app-pool connection). ──
    console.log(`\n=== PHASE B: POST 5801/5802/5803 (checker=${REPOST_ACTOR}) ===`);
    const tie = await closePhase(ids);

    console.log("\ndoc   net        signed     ok  detail");
    console.log("----- ---------- ---------- --- ------------------------------");
    let allOk = true;
    let grand = 0;
    for (const r of tie) { if (!r.ok) allOk = false; grand += r.net; console.log(`5${r.doc.slice(1)} ${fmt(r.net).padStart(10)} ${fmt(r.expected).padStart(10)} ${r.ok ? "OK " : "!!!"} ${r.note}`); }
    console.log("--------------------------------------------------------------");
    console.log(`tours ${tie.length}  grand net ${fmt(grand)}  expected ${fmt(EXPECTED_GRAND_CENTS)}`);
    const grandOk = grand === EXPECTED_GRAND_CENTS && allOk && tie.length === TOURS.length;
    if (grandOk) {
      console.log(`\nDONE — 5801/5802/5803 posted; all tie to the signed net to the penny.`);
      process.exitCode = 0;
    } else {
      console.log(`\nTIE-OUT FAILED — one or more tours off. Phase B posts are committed per-tour; reverse via reverseSettlementPayRun before retry.`);
      process.exitCode = 1;
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nERROR — rolled back Phase A if still open:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest(): void {
  if (REVERSAL_ACTOR === REPOST_ACTOR) throw new Error("selftest FAILED: maker=checker");
  assertToursConsistent();
  for (const t of TOURS) {
    console.log(`[selftest] ${t.doc} ${t.driverName.padEnd(34)} net ${fmt(tourNetCents(t))} (gross ${fmt(tourGrossCents(t))} reimb ${fmt(tourReimbCents(t))} esc ${fmt(tourEscrowCents(t))} admin ${fmt(tourAdminCents(t))} adv ${fmt(tourAdvanceCents(t))})`);
  }
  console.log(`[selftest] ALL PASS — ${TOURS.length} tours, grand ${fmt(EXPECTED_GRAND_CENTS)}, maker!=checker.`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
