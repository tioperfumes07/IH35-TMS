#!/usr/bin/env node
/**
 * August 2026 TRUE RECON — tour-shaped (AlwaysTrack settlement doc).
 * Law: blueprint §3 + MEMORY_BANK tour model + owner 2026-09-24 clarifications.
 */
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DL = "/Users/jorgemunoz/Downloads/IH35-RECONCILIATION-AND-FEED";

const sc = JSON.parse(readFileSync(join(ROOT, "scripts/feed/settlement_control.json"), "utf8"));
const fi = JSON.parse(readFileSync(join(DL, "01-ENGINES/feed_input.json"), "utf8"));
const dc = JSON.parse(readFileSync(join(ROOT, "scripts/feed/day_control.json"), "utf8"));
const closed = JSON.parse(readFileSync(join(ROOT, "scripts/feed/closed_purchase_days.json"), "utf8"));
const fc = JSON.parse(readFileSync(join(DL, "02-CONTROLS-AND-GATES/feed_cursor.json"), "utf8"));

/** NB = Laredo pickup · SB = Laredo delivery · LOCAL = both · TR = neither */
function classifyLeg(stops) {
  const isLar = (city) => /laredo/i.test(String(city || ""));
  const p = (stops || []).filter((s) => String(s.stop_type).toLowerCase().startsWith("pick"));
  const d = (stops || []).filter((s) => String(s.stop_type).toLowerCase().startsWith("deliv"));
  const fromLaredo = p.some((s) => isLar(s.city));
  const toLaredo = d.some((s) => isLar(s.city));
  if (fromLaredo && toLaredo) return "LOCAL";
  if (fromLaredo) return "NB";
  if (toLaredo) return "SB";
  return "TR";
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = Date.parse(b) - Date.parse(a);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

const augLoadSet = new Set();
for (const [day, v] of Object.entries(fc.days)) {
  if (day.startsWith("2026-08")) for (const ln of v.loads || []) if (ln !== "90007") augLoadSet.add(String(ln));
}
for (const r of fi.records) if (String(r.period_end || "").startsWith("2026-08")) augLoadSet.add(r.load_number);

const tours = new Map();
function ensureTour(r) {
  const doc = String(r.settlement_doc_no);
  if (!tours.has(doc)) {
    tours.set(doc, {
      doc,
      period_end: r.period_end,
      period_start: r.period_start,
      driver: r.driver_name,
      truck: r.truck,
      loads: [],
    });
  }
  return tours.get(doc);
}
function addLoad(r) {
  const t = ensureTour(r);
  if (t.loads.some((l) => l.load === r.load_number)) return;
  const ctrl = sc.loads[r.load_number] || {};
  t.loads.push({
    load: r.load_number,
    leg: classifyLeg(r.stops),
    customer: r.customer_name,
    truck: r.truck,
    trailer: r.trailer,
    line_haul: ctrl.line_haul ?? 0,
    driver_pay: ctrl.driver_pay ?? 0,
    fuel: ctrl.fuel ?? 0,
    empty_miles: ctrl.empty_miles ?? 0,
    loaded_miles: ctrl.loaded_miles ?? 0,
    stops: (r.stops || []).map((s) => ({
      type: s.stop_type,
      city: s.city,
      state: s.state,
      date: s.stop_date,
      miles: s.leg_miles,
    })),
    period_end: r.period_end,
  });
  // widen tour window from load stop dates
  for (const s of r.stops || []) {
    if (!s.stop_date) continue;
    if (!t.earliest_stop || s.stop_date < t.earliest_stop) t.earliest_stop = s.stop_date;
    if (!t.latest_stop || s.stop_date > t.latest_stop) t.latest_stop = s.stop_date;
  }
}

for (const r of fi.records) {
  if (augLoadSet.has(r.load_number) || String(r.period_end || "").startsWith("2026-08")) addLoad(r);
}

const allLoads = [...augLoadSet];
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query("BEGIN");
await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

const live = await client.query(
  `
SELECT l.load_number, l.status, l.trip_type,
  (SELECT COUNT(*)::int FROM mdata.load_stops s WHERE s.load_id=l.id AND s.soft_deleted_at IS NULL) stops,
  (SELECT COUNT(*)::int FROM accounting.invoices i WHERE i.source_load_id=l.id AND i.voided_at IS NULL AND COALESCE(i.is_sample_data,false)=false) invoices,
  (SELECT COALESCE(SUM(i.total_cents),0)::bigint FROM accounting.invoices i WHERE i.source_load_id=l.id AND i.voided_at IS NULL) inv_cents,
  (SELECT COUNT(*)::int FROM driver_finance.driver_bills b WHERE b.load_id=l.id AND b.voided_at IS NULL) bills,
  (SELECT COALESCE(SUM(b.gross_amount_cents),0)::bigint FROM driver_finance.driver_bills b WHERE b.load_id=l.id AND b.voided_at IS NULL) bill_cents,
  (SELECT COALESCE(SUM(ft.total_cost),0)::numeric FROM fuel.fuel_transactions ft WHERE ft.load_id=l.id AND ft.voided_at IS NULL AND ft.fuel_type IN ('diesel','def')) fuel,
  (SELECT COUNT(*)::int FROM accounting.expenses e WHERE e.load_id=l.id AND e.voided_at IS NULL AND COALESCE(e.is_sample_data,false)=false) expenses,
  (SELECT COALESCE(SUM(e.total_amount_cents),0)::bigint FROM accounting.expenses e WHERE e.load_id=l.id AND e.voided_at IS NULL) exp_cents,
  (SELECT string_agg(DISTINCT fa.display_id||'(inv'||fa.faro_invoice_number||')', ',')
     FROM accounting.factoring_advances fa
     JOIN accounting.invoices i ON i.factoring_advance_id=fa.id
    WHERE i.source_load_id=l.id AND fa.voided_at IS NULL AND fa.status<>'voided') fa
FROM mdata.loads l
WHERE l.operating_company_id=$1 AND l.load_number=ANY($2::text[])
`,
  [OCI, allLoads]
);
const byLoad = Object.fromEntries(live.rows.map((r) => [r.load_number, r]));

const faDays = dc.days.filter((d) => {
  const [m, , y] = d.date.split("/").map(Number);
  return (y < 100 ? 2000 + y : y) === 2026 && m === 8;
});
const faLive = await client.query(
  `
  SELECT faro_purchase_date::text d, faro_invoice_number inv, display_id, status,
         voided_at IS NOT NULL AS voided, invoice_total_cents, advance_amount_cents,
         reserve_amount_cents, factor_fee_cents,
         (SELECT l.load_number FROM accounting.invoices i JOIN mdata.loads l ON l.id=i.source_load_id
           WHERE i.factoring_advance_id=fa.id AND i.voided_at IS NULL LIMIT 1) load_number
  FROM accounting.factoring_advances fa
  WHERE operating_company_id=$1 AND faro_purchase_date BETWEEN '2026-08-10' AND '2026-08-31'
`,
  [OCI]
);

const gl = await client.query(
  `
SELECT a.account_number, a.account_name, a.account_type, COUNT(*)::int lines,
  SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE 0 END)::bigint debit_cents,
  SUM(CASE WHEN jep.debit_or_credit='credit' THEN jep.amount_cents ELSE 0 END)::bigint credit_cents
FROM accounting.journal_entry_postings jep
JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
JOIN catalogs.accounts a ON a.id=jep.account_id
WHERE je.operating_company_id=$1 AND je.entry_date >= '2026-08-01' AND je.entry_date < '2026-09-01' AND je.voided_at IS NULL
GROUP BY 1,2,3 ORDER BY 1
`,
  [OCI]
);

const setl = await client.query(
  `
SELECT source_document_ref, status, period_start::text, period_end::text, gross_pay::numeric, net_pay::numeric
FROM driver_finance.driver_settlements
WHERE operating_company_id=$1 AND period_end >= '2026-08-01' AND period_end < '2026-09-01'
  AND COALESCE(is_sample_data,false)=false AND voided_at IS NULL
ORDER BY period_end, source_document_ref
`,
  [OCI]
);

const partial = await client.query(
  `
SELECT l.load_number, i.display_id, i.total_cents, i.amount_open_cents, i.amount_paid_cents, i.status
FROM accounting.invoices i JOIN mdata.loads l ON l.id=i.source_load_id
WHERE i.operating_company_id=$1 AND l.load_number=ANY($2::text[])
  AND i.voided_at IS NULL AND i.amount_open_cents>0
ORDER BY i.amount_open_cents DESC
`,
  [OCI, allLoads]
);

const vendors = await client.query(
  `
SELECT v.vendor_name, COUNT(*)::int n, SUM(e.total_amount_cents)::bigint cents
FROM accounting.expenses e
JOIN mdata.vendors v ON v.id=e.vendor_uuid
WHERE e.operating_company_id=$1 AND e.voided_at IS NULL AND COALESCE(e.is_sample_data,false)=false
  AND e.load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id=$1 AND load_number=ANY($2::text[]))
GROUP BY v.vendor_name ORDER BY cents DESC NULLS LAST LIMIT 40
`,
  [OCI, allLoads]
);

await client.query("COMMIT");
await client.end();

const tourRows = [];
for (const t of [...tours.values()].sort((a, b) => Number(a.doc) - Number(b.doc))) {
  const legs = { NB: 0, TR: 0, SB: 0, LOCAL: 0 };
  for (const L of t.loads) legs[L.leg] = (legs[L.leg] || 0) + 1;
  const shape = [];
  if (legs.NB) shape.push(`${legs.NB}NB`);
  if (legs.TR) shape.push(`${legs.TR}TR`);
  if (legs.SB) shape.push(`${legs.SB}SB`);
  if (legs.LOCAL) shape.push(`${legs.LOCAL}LOCAL`);
  const spanDays = daysBetween(t.earliest_stop || t.period_start, t.latest_stop || t.period_end);
  const liveGap = [];
  let liveOk = 0;
  for (const L of t.loads) {
    const row = byLoad[L.load];
    if (!row) {
      liveGap.push(`${L.load}:MISSING_DB`);
      continue;
    }
    const ctrl = sc.loads[L.load];
    const gaps = [];
    if (ctrl) {
      if (Number(row.stops) < Number(ctrl.stops || 0)) gaps.push("stops");
      if (Number(ctrl.driver_pay || 0) > 0 && Number(row.bills) < 1) gaps.push("bill");
      if (Number(row.invoices) < 1) gaps.push("inv");
      if (Math.abs(Number(row.fuel) - Number(ctrl.fuel || 0)) >= 1) gaps.push("fuel");
    }
    if (gaps.length) liveGap.push(`${L.load}:${gaps.join("+")}`);
    else liveOk++;
  }
  tourRows.push({
    tour: t.doc,
    driver: t.driver,
    truck: t.truck,
    period_doc: `${t.period_start}..${t.period_end}`,
    stop_span: `${t.earliest_stop || "?"}..${t.latest_stop || "?"}`,
    span_days: spanDays,
    longer_than_week: spanDays != null && spanDays > 7,
    shape: shape.join("+") || "?",
    n_loads: t.loads.length,
    begins_laredo: t.loads.some((L) => L.leg === "NB" || L.leg === "LOCAL"),
    has_sb: legs.SB > 0,
    missing_sb_flag: legs.SB === 0 && legs.LOCAL === 0,
    triangulation_count: legs.TR,
    deadhead_on_sb: t.loads
      .filter((L) => L.leg === "SB" && Number(L.empty_miles || 0) > 0)
      .map((L) => ({ load: L.load, empty_miles: L.empty_miles })),
    loads: t.loads.map((L) => {
      const row = byLoad[L.load];
      return {
        ...L,
        live: row
          ? {
              status: row.status,
              trip_type: row.trip_type,
              inv: Number(row.inv_cents) / 100,
              bill: Number(row.bill_cents) / 100,
              fuel: Number(row.fuel),
              exp: Number(row.exp_cents) / 100,
              fa: row.fa,
              invoices: row.invoices,
              bills: row.bills,
            }
          : null,
      };
    }),
    composition_ok: liveGap.length === 0 && t.loads.every((L) => byLoad[L.load]),
    gaps: liveGap,
    live_ok_loads: liveOk,
  });
}

const faroDays = [];
let faroCtrlP = 0,
  faroCtrlN = 0,
  faroLiveP = 0,
  faroLiveN = 0;
for (const day of faDays) {
  const [m, dd, y] = day.date.split("/").map(Number);
  const iso = `${y < 100 ? 2000 + y : y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const liveRows = faLive.rows.filter((x) => x.d === iso && !x.voided && x.status !== "voided");
  const purchase = liveRows.reduce((s, x) => s + Number(x.invoice_total_cents), 0) / 100;
  const net = liveRows.reduce((s, x) => s + Number(x.advance_amount_cents), 0) / 100;
  const miss = (day.inv || []).filter((i) => !liveRows.some((x) => String(x.inv) === String(i)));
  const tie =
    Math.abs(purchase - day.purchase) < 0.02 && Math.abs(net - day.net_adv) < 0.02 && !miss.length;
  faroCtrlP += day.purchase;
  faroCtrlN += day.net_adv;
  faroLiveP += purchase;
  faroLiveN += net;
  faroDays.push({
    iso,
    ctrl_inv: day.inv,
    live: liveRows.map((x) => ({
      inv: x.inv,
      fa: x.display_id,
      load: x.load_number,
      purchase: Number(x.invoice_total_cents) / 100,
      adv: Number(x.advance_amount_cents) / 100,
      reserve: Number(x.reserve_amount_cents) / 100,
      fee: Number(x.factor_fee_cents) / 100,
    })),
    purchase: { ctrl: day.purchase, live: Math.round(purchase * 100) / 100 },
    net: { ctrl: day.net_adv, live: Math.round(net * 100) / 100 },
    miss,
    tie,
    closed: closed.closed_purchase_days.includes(iso),
  });
}

const dSum = gl.rows.reduce((s, r) => s + Number(r.debit_cents || 0) / 100, 0);
const cSum = gl.rows.reduce((s, r) => s + Number(r.credit_cents || 0) / 100, 0);
const spans = tourRows.map((t) => t.span_days).filter((n) => n != null);
const avgSpan = spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null;

const report = {
  title: "USMCA August 2026 TRUE RECONCILIATION (tour-shaped)",
  law: [
    "ARCHITECTURE-BLUEPRINT §3: Bill per LOAD; multiple bills → ONE settlement (a trip/tour).",
    "MEMORY_BANK: settlement = TOUR = NB (+ optional TR triangulation) + SB back to Laredo/Mexico. Never group by calendar week as the identity.",
    "GO-22: trip_type NB/TR/SB; NB opens tour; TR/SB join; AlwaysTrack 4-digit doc = settlement identity.",
    "Owner 2026-09-24: sometimes only 1 load (local or NB); breakdown may omit SB; SB may deliver off-Laredo with deadhead miles home to Laredo.",
    "Owner 2026-09-24: a settlement usually spans ~1 week, but can last MORE than a week when triangulation loads extend the tour.",
    "TRIP-TYPE-DERIVE: NB=Laredo pickup, SB=Laredo delivery, TR=neither, LOCAL=Laredo↔Laredo.",
  ],
  generated_at: new Date().toISOString(),
  neon: "tiny-field-89581227 / br-fancy-credit-akjnd07a",
  verdict: {
    faro_purchase_days: faroDays.every((d) => d.tie) ? "TIE" : "GAP",
    faro_days_tied: `${faroDays.filter((d) => d.tie).length}/${faroDays.length}`,
    faro_ctrl_purchase: faroCtrlP,
    faro_live_purchase: Math.round(faroLiveP * 100) / 100,
    faro_ctrl_net_adv: Math.round(faroCtrlN * 100) / 100,
    faro_live_net_adv: Math.round(faroLiveN * 100) / 100,
    tours_in_scope: tourRows.length,
    tours_composition_ok: tourRows.filter((t) => t.composition_ok).length,
    tours_with_gaps: tourRows.filter((t) => !t.composition_ok).length,
    tour_span_days_avg: avgSpan,
    tour_span_days_min: spans.length ? Math.min(...spans) : null,
    tour_span_days_max: spans.length ? Math.max(...spans) : null,
    tours_longer_than_week: tourRows.filter((t) => t.longer_than_week).map((t) => `${t.tour}(${t.span_days}d/${t.triangulation_count}TR)`),
    tours_missing_sb: tourRows.filter((t) => t.missing_sb_flag).map((t) => t.tour),
    tours_not_beginning_laredo: tourRows.filter((t) => !t.begins_laredo).map((t) => t.tour),
    feed_cursor_aug_pending: Object.entries(fc.days)
      .filter(([k, v]) => k.startsWith("2026-08") && v.state !== "closed")
      .map(([k]) => k),
    driver_settlements_minted_aug: setl.rows.length,
    partial_open_invoices: partial.rows.length,
    gl_aug_debit: Math.round(dSum * 100) / 100,
    gl_aug_credit: Math.round(cSum * 100) / 100,
    gl_balanced: Math.abs(dSum - cSum) < 0.02,
  },
  tours: tourRows,
  faro_days: faroDays,
  settlements_minted: setl.rows,
  partial_open_invoices: partial.rows.map((r) => ({
    load: r.load_number,
    invoice: r.display_id,
    total: Number(r.total_cents) / 100,
    open: Number(r.amount_open_cents) / 100,
    paid: Number(r.amount_paid_cents) / 100,
    status: r.status,
  })),
  vendors_on_aug_loads: vendors.rows.map((r) => ({
    vendor: r.vendor_name,
    n: r.n,
    amount: Number(r.cents || 0) / 100,
  })),
  gl_august: gl.rows.map((r) => ({
    account: r.account_number,
    name: r.account_name,
    type: r.account_type,
    lines: r.lines,
    debit: Number(r.debit_cents) / 100,
    credit: Number(r.credit_cents) / 100,
  })),
};

mkdirSync(join(ROOT, "docs/recon"), { recursive: true });
writeFileSync(join(ROOT, "docs/recon/AUGUST-2026-TRUE-RECON.json"), JSON.stringify(report, null, 2));

const md = [];
md.push("# USMCA August 2026 — TRUE RECONCILIATION (tour-shaped)");
md.push("");
md.push(`Generated: ${report.generated_at} · Neon \`${report.neon}\``);
md.push("");
md.push("## Law (architecture + owner)");
md.push("");
for (const L of report.law) md.push(`- ${L}`);
md.push("");
md.push("## Verdict");
md.push("");
const v = report.verdict;
md.push("| Check | Result |");
md.push("|---|---|");
md.push(`| Faro 8/10–8/31 | **${v.faro_purchase_days}** ${v.faro_days_tied} |`);
md.push(`| Faro purchase $ | ctrl ${v.faro_ctrl_purchase.toFixed(2)} / live ${v.faro_live_purchase.toFixed(2)} |`);
md.push(`| Faro net adv $ | ctrl ${v.faro_ctrl_net_adv.toFixed(2)} / live ${v.faro_live_net_adv.toFixed(2)} |`);
md.push(`| Tours in scope | ${v.tours_in_scope} |`);
md.push(`| Tours composition OK | ${v.tours_composition_ok} / gaps ${v.tours_with_gaps} |`);
md.push(`| Tour duration (stop span) | avg ${v.tour_span_days_avg}d · min ${v.tour_span_days_min}d · max ${v.tour_span_days_max}d |`);
md.push(`| Tours longer than 7 days (triangulations extend) | ${v.tours_longer_than_week.join(", ") || "none"} |`);
md.push(`| Tours missing SB (open / breakdown / local-only — not auto-fail) | ${v.tours_missing_sb.join(", ") || "none"} |`);
md.push(`| Tours not beginning Laredo | ${v.tours_not_beginning_laredo.join(", ") || "none"} |`);
md.push(`| feed_cursor Aug pending | ${v.feed_cursor_aug_pending.length ? v.feed_cursor_aug_pending.join(", ") : "**NONE**"} |`);
md.push(`| Minted driver_settlements (period_end Aug) | ${v.driver_settlements_minted_aug} |`);
md.push(`| Partial open invoices | ${v.partial_open_invoices} |`);
md.push(`| GL Aug debit/credit | ${v.gl_aug_debit.toFixed(2)} / ${v.gl_aug_credit.toFixed(2)} balanced=${v.gl_balanced ? "YES" : "NO"} |`);
md.push("");
md.push("## Tours (AlwaysTrack doc = settlement identity)");
md.push("");
md.push("| Tour | Driver | Shape | Span | >7d | Loads | Laredo start | SB | Composition |");
md.push("|---|---|---|---|---|---|---|---|---|");
for (const t of tourRows) {
  md.push(
    `| ${t.tour} | ${t.driver} | ${t.shape} | ${t.span_days ?? "?"}d | ${t.longer_than_week ? "Y" : ""} | ${t.loads.map((L) => `${L.load}(${L.leg})`).join(" · ")} | ${t.begins_laredo ? "Y" : "N"} | ${t.has_sb ? "Y" : "N"} | ${t.composition_ok ? "OK" : t.gaps.join("; ")} |`
  );
}
md.push("");
md.push("### Per-tour load money (LIVE)");
md.push("");
for (const t of tourRows) {
  md.push(`#### Tour ${t.tour} — ${t.shape} — ${t.span_days ?? "?"}d — ${t.driver} / ${t.truck}`);
  md.push("");
  md.push("| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |");
  md.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const L of t.loads) {
    const liveRow = L.live;
    md.push(
      `| ${L.load} | ${L.leg} | ${(L.line_haul || 0).toFixed(2)} | ${liveRow ? liveRow.inv.toFixed(2) : "MISSING"} | ${(L.driver_pay || 0).toFixed(2)} | ${liveRow ? liveRow.bill.toFixed(2) : "-"} | ${(L.fuel || 0).toFixed(2)} | ${liveRow ? Number(liveRow.fuel).toFixed(2) : "-"} | ${liveRow ? liveRow.exp.toFixed(2) : "-"} | ${liveRow?.fa || "-"} |`
    );
  }
  if (t.deadhead_on_sb.length) {
    md.push(
      `\nDeadhead on SB (home to Laredo): ${t.deadhead_on_sb.map((x) => `${x.load}=${x.empty_miles} mi`).join(", ")}`
    );
  }
  md.push("");
}
md.push("## Faro purchase days");
md.push("");
md.push("| Day | Inv | Purchase live/ctrl | Net live/ctrl | Tie |");
md.push("|---|---|---|---|---|");
for (const d of faroDays) {
  md.push(
    `| ${d.iso} | ${d.ctrl_inv.join(",")} | ${d.purchase.live}/${d.purchase.ctrl} | ${d.net.live}/${d.net.ctrl} | ${d.tie ? "TIE" : "GAP"} |`
  );
}
md.push("");
md.push("## Partial / open invoices");
md.push("");
if (!report.partial_open_invoices.length) md.push("_None open._");
else {
  md.push("| Load | Invoice | Total | Open | Paid |");
  md.push("|---|---|---|---|---|");
  for (const r of report.partial_open_invoices) {
    md.push(`| ${r.load} | ${r.invoice} | ${r.total.toFixed(2)} | ${r.open.toFixed(2)} | ${r.paid.toFixed(2)} |`);
  }
}
md.push("");
md.push("## Vendors on Aug-scope load expenses");
md.push("");
md.push("| Vendor | Rows | Amount |");
md.push("|---|---|---|");
for (const r of report.vendors_on_aug_loads) md.push(`| ${r.vendor} | ${r.n} | ${r.amount.toFixed(2)} |`);
md.push("");
md.push("## GL accounts (entry_date in August)");
md.push("");
md.push("| Acct | Name | Type | Lines | Debit | Credit |");
md.push("|---|---|---|---|---|---|");
for (const r of report.gl_august) {
  md.push(`| ${r.account} | ${r.name} | ${r.type} | ${r.lines} | ${r.debit.toFixed(2)} | ${r.credit.toFixed(2)} |`);
}
md.push("");
md.push("## Linkage");
md.push("");
md.push("- Tour identity = AlwaysTrack 4-digit `source_document_ref` / settlement_control `company_doc`.");
md.push("- Duration = stop-date span of the tour's loads (usually ~7d; longer when TR legs extend).");
md.push("- Legs: NB/TR/SB/LOCAL derived from Laredo pickup/delivery (or live `trip_type`).");
md.push("- Bill per load → ONE settlement (blueprint §3). Faro FA → invoice → load.");
md.push("- Tables: loads, load_stops, invoices, factoring_advances, driver_bills, fuel_transactions, expenses, journal_entries + journal_entry_postings, accounts, vendors.");
md.push("");
md.push("JSON twin: `docs/recon/AUGUST-2026-TRUE-RECON.json`");

writeFileSync(join(ROOT, "docs/recon/AUGUST-2026-TRUE-RECON.md"), md.join("\n"));
console.log(JSON.stringify(report.verdict, null, 2));
console.log(
  "shapes",
  Object.fromEntries(
    [...tourRows.reduce((m, t) => {
      m.set(t.shape, (m.get(t.shape) || 0) + 1);
      return m;
    }, new Map())]
  )
);
console.log(
  "gap tours",
  tourRows.filter((t) => !t.composition_ok).map((t) => `${t.tour}:${t.gaps.join(",")}`)
);
