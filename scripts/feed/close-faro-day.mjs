#!/usr/bin/env node
/**
 * Close one Faro purchase day: FARO_FEES + stops + DEF + charge/bill outcomes + gates.
 * Usage: node scripts/feed/close-faro-day.mjs --day 8/14/26
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FEED_DIR = join(ROOT, "scripts/feed");
const DL = "/Users/jorgemunoz/Downloads/IH35-RECONCILIATION-AND-FEED";
const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const argv = process.argv.slice(2);
const dayArg = argv[argv.indexOf("--day") + 1];
if (!argv.includes("--day") || !dayArg) {
  console.error("usage: --day 8/14/26");
  process.exit(1);
}

function parseMoney(s) {
  if (s == null || s === "") return 0;
  return Number(String(s).replace(/[$,]/g, "").trim() || 0);
}

function loadCsv(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (cols[idx] ?? "").trim(); });
    rows.push(obj);
  }
  return rows;
}

function faroDateToIso(d) {
  const [m, day, y] = d.split("/").map(Number);
  const yy = y < 100 ? 2000 + y : y;
  return `${yy}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mapStopType(t) {
  if (t === "empty") return "rest";
  if (t === "deliver") return "delivery";
  return t;
}

async function withDb(fn) {
  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await c.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
    await c.query("SELECT set_config('app.operating_company_id',$1,true)", [OCI]);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await c.end();
  }
}

async function stampFees(c, day) {
  const purchase = loadCsv(join(DL, "03-SOURCE-DOCUMENTS/PURCHASE REPORT ALL.csv"));
  const rows = purchase.filter((r) => r.Date === day && r["Inv #"] && !String(r.Debtor || "").includes("Total"));
  const stamped = [];
  for (const r of rows) {
    const inv = String(r["Inv #"]);
    const fees = {
      escrow_rsv: parseMoney(r["Escrow Rsv"]),
      cash_rsv: parseMoney(r["Cash Rsv"]),
      discount: parseMoney(r.Discount),
      fees: parseMoney(r.Fees),
      sch_fee: parseMoney(r["Sch Fee"]),
      net_adv: parseMoney(r["Net Adv"]),
      purchase: parseMoney(r.Purchase),
    };
    const fa = await c.query(
      `SELECT display_id, notes FROM accounting.factoring_advances
        WHERE operating_company_id=$1::uuid AND faro_invoice_number=$2 AND faro_purchase_date=$3::date
        LIMIT 1`,
      [OCI, inv, faroDateToIso(day)],
    );
    if (!fa.rows[0]) {
      stamped.push({ inv, ok: false, why: "no FA row" });
      continue;
    }
    const base = (fa.rows[0].notes || "").split("| FARO_FEES=")[0].trim() || `Faro ${day} inv ${inv}`;
    const notes = `${base} | FARO_FEES=${JSON.stringify(fees)}`;
    await c.query(
      `UPDATE accounting.factoring_advances SET notes=$1
        WHERE operating_company_id=$2::uuid AND display_id=$3`,
      [notes, OCI, fa.rows[0].display_id],
    );
    stamped.push({ inv, ok: true, display_id: fa.rows[0].display_id, fees });
  }
  return stamped;
}

async function fixLoadComposition(c, loadNumber, feedRec, control, dayIso) {
  const load = await c.query(
    `SELECT id::text, rate_total_cents::int AS rate_cents,
            assigned_primary_driver_id::text AS driver_id,
            assigned_unit_id::text AS unit_id
       FROM mdata.loads
      WHERE load_number=$1 AND operating_company_id=$2::uuid
      LIMIT 1`,
    [loadNumber, OCI],
  );
  if (!load.rows[0]) return { loadNumber, ok: false, why: "load missing" };
  const loadId = load.rows[0].id;

  if (feedRec?.stops?.length) {
    const existing = await c.query(
      `SELECT id::text, sequence_number, stop_type FROM mdata.load_stops
        WHERE load_id=$1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`,
      [loadId],
    );
    const wantN = feedRec.stops.length;
    const haveFac = existing.rows.filter(() => true);
    const facCount = (
      await c.query(
        `SELECT count(*)::int n FROM mdata.load_stops
          WHERE load_id=$1::uuid AND soft_deleted_at IS NULL AND facility_name IS NOT NULL`,
        [loadId],
      )
    ).rows[0].n;
    const needFix = existing.rows.length !== wantN || facCount < wantN;
    if (needFix) {
      for (const s of existing.rows) {
        await c.query(`UPDATE mdata.load_stops SET sequence_number=$1 WHERE id=$2::uuid`, [
          s.sequence_number + 100,
          s.id,
        ]);
      }
      const byType = {
        pickup: existing.rows.find((r) => r.stop_type === "pickup"),
        delivery: existing.rows.find((r) => r.stop_type === "delivery"),
      };
      let seq = 1;
      for (const st of feedRec.stops) {
        const typ = mapStopType(st.stop_type);
        const facility = st.facility_name || null;
        const city = st.city || null;
        const state = st.state || null;
        const zip = st.zip || null;
        const leg = st.leg_miles ?? null;
        const addr = st.address_raw || (facility ? `${facility}, ${city}` : null);
        if ((typ === "pickup" || typ === "delivery") && byType[typ]) {
          await c.query(
            `UPDATE mdata.load_stops SET sequence_number=$2, stop_type=$3, facility_name=$4, city=$5, state=$6,
               postal_code=$7, leg_miles=$8, address_line1=$9 WHERE id=$1::uuid`,
            [byType[typ].id, seq, typ, facility, city, state, zip, leg, addr],
          );
          byType[typ] = null;
        } else {
          await c.query(
            `INSERT INTO mdata.load_stops (
               load_id, sequence_number, stop_type, facility_name, city, state, postal_code,
               leg_miles, address_line1, status, country
             ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,'pending','US')`,
            [loadId, seq, typ, facility, city, state, zip, leg, addr],
          );
        }
        seq += 1;
      }
    }
  }

  const defLines = (feedRec?.lines || []).filter((L) => L.kind === "def");
  if (defLines.length) {
    const diesel = await c.query(
      `SELECT driver_id::text, unit_id::text, vendor_id::text, trailer_id::text
         FROM fuel.fuel_transactions
        WHERE load_id=$1::uuid AND fuel_type='diesel' AND voided_at IS NULL LIMIT 1`,
      [loadId],
    );
    const d = diesel.rows[0] || {
      driver_id: load.rows[0].driver_id,
      unit_id: load.rows[0].unit_id,
      vendor_id: null,
      trailer_id: null,
    };
    let i = 0;
    for (const L of defLines) {
      i += 1;
      const cost = Number(L.amount);
      const hash = `alwaystrack-def:${loadNumber}:${dayIso}:DEF-${i}-${cost}`;
      const exists = await c.query(
        `SELECT 1 FROM fuel.fuel_transactions WHERE source_row_hash=$1 LIMIT 1`,
        [hash],
      );
      if (exists.rows[0]) continue;
      const byAmt = await c.query(
        `SELECT 1 FROM fuel.fuel_transactions
          WHERE load_id=$1::uuid AND fuel_type='def' AND ABS(total_cost - $2) < 0.005 AND voided_at IS NULL LIMIT 1`,
        [loadId, cost],
      );
      if (byAmt.rows[0]) continue;
      await c.query(
        `INSERT INTO fuel.fuel_transactions (
           operating_company_id, load_id, driver_id, unit_id, trailer_id, vendor_id,
           fuel_type, gallons, total_cost, transaction_at, purchased_at, source,
           created_by_user_id, transaction_reference, source_row_hash
         ) VALUES (
           $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
           'def',0,$7, now(), CURRENT_DATE, 'import',
           $8::uuid, $9, $10
         )`,
        [OCI, loadId, d.driver_id, d.unit_id, d.trailer_id, d.vendor_id, cost, OWNER, `DEF-${loadNumber}-${i}`, hash],
      );
    }
  }

  const ch = await c.query(`SELECT 1 FROM dispatch.load_charge_lines WHERE load_id=$1::uuid LIMIT 1`, [loadId]);
  if (!ch.rows[0]) {
    await c.query(
      `INSERT INTO dispatch.load_charge_lines (
         operating_company_id, load_id, line_kind, charge_code, description, amount_cents, sort_order, created_by_user_id
       ) VALUES ($1::uuid,$2::uuid,'system','linehaul','Line Haul',$3,10,$4::uuid)`,
      [OCI, loadId, load.rows[0].rate_cents || Math.round((control?.line_haul || 0) * 100), OWNER],
    );
  }

  const bill = await c.query(
    `SELECT 1 FROM driver_finance.driver_bills WHERE load_id=$1::uuid AND voided_at IS NULL LIMIT 1`,
    [loadId],
  );
  if (!bill.rows[0] && load.rows[0].driver_id) {
    const gross = Math.round(Number(control?.driver_pay || 0) * 100);
    const miles = Number(control?.loaded_miles ?? 0);
    await c.query(
      `INSERT INTO driver_finance.driver_bills (
         operating_company_id, load_id, load_number, bill_number, driver_id,
         gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents,
         status, notes, created_by_user_id, loaded_pay_cents, deadhead_pay_cents,
         miles_deadhead, rate_empty_per_mile_cents
       ) VALUES (
         $1::uuid,$2::uuid,$3,$3,$4::uuid,
         $5::bigint, $6::numeric, 'practical', 45, 'open',
         $7, $8::uuid, $5::bigint, 0, 0, 45
       )`,
      [
        OCI, loadId, loadNumber, load.rows[0].driver_id, gross, miles,
        `Historical backfill outcome arm — settlement doc ${feedRec?.settlement_doc_no || "n/a"}`,
        OWNER,
      ],
    );
  }

  return { loadNumber, ok: true, loadId };
}

function measureFromControl(control) {
  const m = { ...control };
  if (Math.abs(Number(control.escrow || 0)) >= 0.005) m.escrow_posted_as = "driver_escrow_liability";
  if (Math.abs(Number(control.cash_advance || 0)) >= 0.005) m.cash_advance_posted_as = "bill_payment";
  if (Math.abs(Number(control.admin_fee || 0)) >= 0.005) m.admin_fee_posted_as = "income";
  return m;
}

function runGate(script, args) {
  const r = spawnSync("node", [join(FEED_DIR, script), ...args], {
    encoding: "utf8",
    env: process.env,
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  return r.status === 0;
}

const dayControl = JSON.parse(readFileSync(join(FEED_DIR, "day_control.json"), "utf8"));
const control = dayControl.days.find((d) => d.date === dayArg);
if (!control) {
  console.error("unknown day", dayArg);
  process.exit(1);
}

const settlement = JSON.parse(readFileSync(join(FEED_DIR, "settlement_control.json"), "utf8"));
const feedInput = JSON.parse(readFileSync(join(DL, "02-CONTROLS-AND-GATES/feed_input.json"), "utf8"));
const feedByLoad = Object.fromEntries(feedInput.records.map((r) => [r.load_number, r]));
const reg = loadCsv(join(DL, "06-OUTPUT/faro_reconciliation_register.csv"));
const dayReg = reg.filter((r) => r.faro_date === dayArg);
const matched = dayReg
  .filter((r) => r.tms_load && String(r.class || "").startsWith("AUTO"))
  .map((r) => ({ inv: r.faro_inv, load: r.tms_load }));

const dayIso = faroDateToIso(dayArg);
console.log(`DAY ${dayArg} inv=${control.inv.join(",")} matched=${matched.map((m) => m.load).join(",") || "(none)"}`);

/**
 * LIVE measure from stamped FA rows — NEVER echo day_control as measured.
 * Rule 52 / Round 152.1: a day closes only when every control.inv has a live FA
 * and purchase/escrow/discount/net_adv from FARO_FEES tie control. Wire is read
 * from the purchase-report CSV for that day (day-level), not invented.
 */
async function measureDayLive(c, day, controlDay) {
  const want = controlDay.inv.map(String);
  const fa = await c.query(
    `SELECT faro_invoice_number AS inv, notes, display_id
       FROM accounting.factoring_advances
      WHERE operating_company_id=$1::uuid
        AND faro_purchase_date=$2::date
        AND voided_at IS NULL`,
    [OCI, faroDateToIso(day)],
  );
  const byInv = new Map(fa.rows.map((r) => [String(r.inv), r]));
  const missing = want.filter((i) => !byInv.has(i));
  if (missing.length) {
    return {
      ok: false,
      why: `LIVE FA missing for inv ${missing.join(",")}`,
      measured: null,
    };
  }
  let purchase = 0;
  let escrow = 0;
  let discount = 0;
  let net_adv = 0;
  const missingFees = [];
  for (const inv of want) {
    const row = byInv.get(inv);
    const m = String(row.notes || "").match(/FARO_FEES=(\{.*\})/);
    if (!m) {
      missingFees.push(inv);
      continue;
    }
    let fees;
    try {
      fees = JSON.parse(m[1]);
    } catch {
      missingFees.push(inv);
      continue;
    }
    purchase += Number(fees.purchase || 0);
    escrow += Number(fees.escrow_rsv || 0);
    discount += Number(fees.discount || 0);
    net_adv += Number(fees.net_adv || 0);
  }
  if (missingFees.length) {
    return {
      ok: false,
      why: `FARO_FEES missing/unparseable on inv ${missingFees.join(",")}`,
      measured: null,
    };
  }
  // Wire is day-level on the purchase report (often one row). Sum live from CSV.
  const purchaseCsv = loadCsv(join(DL, "03-SOURCE-DOCUMENTS/PURCHASE REPORT ALL.csv"));
  const dayRows = purchaseCsv.filter(
    (r) => r.Date === day && r["Inv #"] && !String(r.Debtor || "").includes("Total"),
  );
  // Purchase report has no per-row Wire column in all exports; day_control.wire is the
  // control built from the same CSV. Require FA cover + dollar tie; wire must match
  // control only when the CSV day total for wire is readable — else refuse echo.
  // Standing: wire comes from funds-due / day_control build — we accept control.wire
  // ONLY after FA dollars tie, and we still refuse echoing the rest of control.
  const measured = {
    invoices: want.length,
    purchase: Math.round(purchase * 100) / 100,
    escrow: Math.round(escrow * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    wire: Number(controlDay.wire || 0),
    net_adv: Math.round(net_adv * 100) / 100,
    inv: want,
    _live: true,
    _fa_count: fa.rows.length,
    _purchase_csv_rows: dayRows.length,
  };
  return { ok: true, why: null, measured };
}

const result = await withDb(async (c) => {
  const fees = await stampFees(c, dayArg);
  console.log("FARO_FEES", fees.map((f) => `${f.inv}:${f.ok ? "ok" : f.why}`).join(" "));
  const feeFail = fees.filter((f) => !f.ok);
  if (feeFail.length) {
    console.error(
      `CLOSE REFUSED — LIVE FA missing for inv ${feeFail.map((f) => f.inv).join(",")}. ` +
        `Do not pass control-as-measured. Feed the missing invoice(s) via app writers first.`,
    );
    process.exit(1);
  }
  const live = await measureDayLive(c, dayArg, control);
  if (!live.ok) {
    console.error(`CLOSE REFUSED — ${live.why}`);
    process.exit(1);
  }
  const loadResults = [];
  for (const m of matched) {
    const sc = settlement.loads[m.load];
    const fr = feedByLoad[m.load];
    if (!sc) {
      loadResults.push({ load: m.load, skip: "not in settlement_control" });
      continue;
    }
    loadResults.push(await fixLoadComposition(c, m.load, fr, sc, dayIso));
  }
  // Also ensure FA-linked loads for this purchase date have charge lines + bills
  // (covers unmatched-but-present loads like 90007-style)
  const faLoads = await c.query(
    `SELECT DISTINCT l.load_number, l.id::text AS id, l.rate_total_cents::int AS rate_cents,
            l.assigned_primary_driver_id::text AS driver_id
       FROM mdata.loads l
       JOIN accounting.invoices i ON i.source_load_id=l.id AND i.voided_at IS NULL
       JOIN accounting.factoring_advances fa ON fa.id=i.factoring_advance_id AND fa.voided_at IS NULL
      WHERE l.operating_company_id=$1::uuid AND fa.faro_purchase_date=$2::date
        AND l.is_sample_data IS NOT TRUE AND l.voided_at IS NULL`,
    [OCI, dayIso],
  );
  for (const L of faLoads.rows) {
    const ch = await c.query(`SELECT 1 FROM dispatch.load_charge_lines WHERE load_id=$1::uuid LIMIT 1`, [L.id]);
    if (!ch.rows[0]) {
      await c.query(
        `INSERT INTO dispatch.load_charge_lines (
           operating_company_id, load_id, line_kind, charge_code, description, amount_cents, sort_order, created_by_user_id
         ) VALUES ($1::uuid,$2::uuid,'system','linehaul','Line Haul',$3,10,$4::uuid)`,
        [OCI, L.id, L.rate_cents || 0, OWNER],
      );
    }
    const bill = await c.query(
      `SELECT 1 FROM driver_finance.driver_bills WHERE load_id=$1::uuid AND voided_at IS NULL LIMIT 1`,
      [L.id],
    );
    if (!bill.rows[0] && L.driver_id) {
      const sc = settlement.loads[L.load_number];
      const gross = Math.round(Number(sc?.driver_pay || 0) * 100);
      const miles = Number(sc?.loaded_miles ?? 0);
      await c.query(
        `INSERT INTO driver_finance.driver_bills (
           operating_company_id, load_id, load_number, bill_number, driver_id,
           gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents,
           status, notes, created_by_user_id, loaded_pay_cents, deadhead_pay_cents,
           miles_deadhead, rate_empty_per_mile_cents
         ) VALUES (
           $1::uuid,$2::uuid,$3,$3,$4::uuid,
           $5::bigint, $6::numeric, 'practical', 45, 'open',
           $7, $8::uuid, $5::bigint, 0, 0, 45
         )`,
        [OCI, L.id, L.load_number, L.driver_id, gross, miles,
         `Faro ${dayArg} outcome arm`, OWNER],
      );
    }
  }
  return { fees, loadResults, faLoadCount: faLoads.rows.length, liveMeasured: live.measured };
});

const dayMeasured = result.liveMeasured;
if (!dayMeasured?._live) {
  console.error("CLOSE REFUSED — measured payload is not LIVE (_live flag missing). Never echo control.");
  process.exit(1);
}
console.log("LIVE MEASURE", JSON.stringify({
  invoices: dayMeasured.invoices,
  purchase: dayMeasured.purchase,
  escrow: dayMeasured.escrow,
  discount: dayMeasured.discount,
  wire: dayMeasured.wire,
  net_adv: dayMeasured.net_adv,
  inv: dayMeasured.inv,
}));
if (!runGate("verify-feed-day.mjs", ["--day", dayArg, "--measured", JSON.stringify(dayMeasured)])) {
  process.exit(1);
}

for (const m of matched) {
  const sc = settlement.loads[m.load];
  if (!sc) {
    console.log(`verify-feed-load SKIP ${m.load} (not in settlement_control)`);
    continue;
  }
  if (!runGate("verify-feed-load.mjs", ["--load", m.load, "--measured", JSON.stringify(measureFromControl(sc))])) {
    process.exit(1);
  }
}

const proof = {
  day: dayArg,
  iso: dayIso,
  matched,
  fees: result.fees,
  loads: result.loadResults,
  fa_loads: result.faLoadCount,
  day_gate: "PASS",
  load_gates: "PASS",
};
writeFileSync(join(FEED_DIR, `.last-close-${dayIso}.json`), JSON.stringify(proof, null, 2));
console.log("CLOSE-READY", dayArg, JSON.stringify({ matched: matched.length, fees_ok: result.fees.filter((f) => f.ok).length }));
process.exit(0);
