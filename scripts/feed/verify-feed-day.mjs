#!/usr/bin/env node
/**
 * GUARD — verify-feed-day
 *
 * WHAT THIS PROTECTS
 * The re-feed runs one Faro purchase day at a time, 23 days, 8/10/26 -> 9/21/26. A day that
 * does not tie to Faro's own export must STOP the feed. Feeding day N+1 on top of an untied
 * day N is exactly how the last population drifted: each day looked close, nobody closed one,
 * and the error compounded 23 times.
 *
 * FIVE COLUMNS, ALL FIVE, EVERY DAY. Count is a column: a day with the right dollars and the
 * wrong number of invoices is NOT tied.
 *
 * CONTROL: day_control.json, built by build_day_control.py straight from
 *   01-FARO/PURCHASE REPORT ALL.csv + funds due report 09-21-26.csv.
 *   No number in it is hand-typed. Its own build asserts 8 independent controls and the
 *   identity purchases - receipts = A/R 298,762.00.
 *
 * USAGE
 *   node verify-feed-day.mjs --day 8/10/26            live, needs DATABASE_URL
 *   node verify-feed-day.mjs --day 8/10/26 --measured '<json>'   compare a supplied measurement
 *   node verify-feed-day.mjs --selftest               no DB, proves the comparator fails
 *
 * FAIL-CLOSED: no DATABASE_URL and no --measured in live mode = exit 1, never skip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-feed-day";
const CONTROL_FILE = new URL("./day_control.json", import.meta.url);
const TOL = 0.005;                       // half a cent
const COLUMNS = ["invoices", "purchase", "escrow", "discount", "wire", "net_adv"];

function loadControl(day) {
  const c = JSON.parse(readFileSync(CONTROL_FILE, "utf8"));
  const d = c.days.find((x) => x.date === day);
  if (!d) {
    throw new Error(
      `${LABEL}: ${day} is not one of the 23 Faro purchase days. Valid: ${c.days.map((x) => x.date).join(", ")}`
    );
  }
  return d;
}

/** Pure comparator. Returns [] when the day ties. */
export function compareDay(control, measured) {
  const errors = [];
  for (const col of COLUMNS) {
    const want = Number(control[col] ?? 0);
    const got = Number(measured[col] ?? 0);
    if (Math.abs(want - got) >= TOL) {
      errors.push(
        `${col}: Faro says ${want.toLocaleString("en-US", { minimumFractionDigits: col === "invoices" ? 0 : 2 })}, ` +
          `we fed ${got.toLocaleString("en-US", { minimumFractionDigits: col === "invoices" ? 0 : 2 })} ` +
          `(delta ${(got - want).toFixed(2)})`
      );
    }
  }
  // Every Faro invoice on this day must exist in what we fed, by invoice number.
  const want = new Set((control.inv ?? []).map(String));
  const got = new Set((measured.inv ?? []).map(String));
  const missing = [...want].filter((i) => !got.has(i));
  const extra = [...got].filter((i) => !want.has(i));
  if (missing.length) errors.push(`invoices Faro purchased that we did NOT feed: ${missing.join(", ")}`);
  if (extra.length) errors.push(`invoices we fed that Faro did NOT purchase: ${extra.join(", ")}`);
  return errors;
}

function selftest() {
  const control = loadControl("8/10/26");
  const perfect = {
    invoices: control.invoices, purchase: control.purchase, escrow: control.escrow,
    discount: control.discount, wire: control.wire, net_adv: control.net_adv, inv: control.inv,
  };
  const base = compareDay(control, perfect);
  if (base.length) {
    console.error(`${LABEL} --selftest FAIL — a perfect day did not tie:`);
    for (const e of base) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    ["one cent short on purchase", (m) => ({ ...m, purchase: m.purchase - 0.01 })],
    ["one cent over on net advance", (m) => ({ ...m, net_adv: m.net_adv + 0.01 })],
    ["escrow missed entirely", (m) => ({ ...m, escrow: 0 })],
    ["discount missed entirely", (m) => ({ ...m, discount: 0 })],
    ["wire fee dropped", (m) => ({ ...m, wire: 0 })],
    ["right dollars, one invoice too few", (m) => ({ ...m, invoices: m.invoices - 1, inv: m.inv.slice(1) })],
    ["right count, wrong invoice number", (m) => ({ ...m, inv: [...m.inv.slice(1), "9999"] })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate({ ...perfect, inv: [...perfect.inv] });
    if (JSON.stringify(broken) === JSON.stringify(perfect)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (compareDay(control, broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — a perfect 8/10/26 ties and ${mutations.length} mutations all trip the gate.`);
  process.exit(0);
}

const argv = process.argv.slice(2);
if (argv.includes("--selftest")) selftest();

const day = argv[argv.indexOf("--day") + 1];
if (!argv.includes("--day") || !day) {
  console.error(`${LABEL} FAIL — --day is required (e.g. --day 8/10/26).`);
  process.exit(1);
}
let control;
try {
  control = loadControl(day);
} catch (e) {
  console.error(`${LABEL} FAIL — ${e.message}`);
  process.exit(1);
}

let measured = null;
if (argv.includes("--measured")) {
  measured = JSON.parse(argv[argv.indexOf("--measured") + 1]);
} else if (!process.env.DATABASE_URL) {
  console.error(`${LABEL} FAIL — no DATABASE_URL and no --measured. This guard never skips.`);
  process.exit(1);
} else {
  console.error(`${LABEL} FAIL — live DB mode is not wired yet. Pass --measured, or wire the query (see LIVE QUERY below).`);
  process.exit(1);
}

const errors = compareDay(control, measured);
console.log(`${LABEL} ${day} — Faro: ${control.invoices} invoices, $${control.purchase.toLocaleString("en-US", { minimumFractionDigits: 2 })} purchased, $${control.net_adv.toLocaleString("en-US", { minimumFractionDigits: 2 })} advanced`);
if (errors.length) {
  console.error(`${LABEL} FAIL — day ${day} does NOT tie. THE FEED STOPS HERE. Do not feed the next day.`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — day ${day} ties on all five columns and every invoice number.`);
