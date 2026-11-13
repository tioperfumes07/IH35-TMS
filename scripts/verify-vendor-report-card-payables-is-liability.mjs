#!/usr/bin/env node
/**
 * verify-vendor-report-card-payables-is-liability — BOARD 31 (LEAD ROUND 8.25).
 * Root cause it guards (live, BOARD-45-STATUS row 31): Reports › Vendors "Card payables" printed kpis.fuel_cents —
 * period fuel SPEND — under a liability label. The backend already returns the canonical liability
 * (card_payables_cents from readCardPayableBalances: Dreamline 2510 + WEX 2520 credit balances).
 *   1. the tile value reads kpis.card_payables_cents; 2. it never reads fuel_cents;
 *   3. it drills to a card-payable account register; 4. the backend still sources it from readCardPayableBalances.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-vendor-report-card-payables-is-liability";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE = "apps/frontend/src/pages/reports/boards/VendorReportBoard.tsx";
const BE = "apps/backend/src/mdata/canonical/party-board.service.ts";

export function check(files) {
  const f = [];
  const fe = files[FE] ?? "";
  const be = files[BE] ?? "";
  const i = fe.indexOf('testId="vr-kpi-card-payables"');
  if (i < 0) return ["Card payables tile missing"];
  const tile = fe.slice(i, fe.indexOf("/>", i));
  if (!/value=\{board\.data \? money\(board\.data\.kpis\.card_payables_cents \?\? 0\) : "…"\}/.test(tile)) f.push("tile value does not read kpis.card_payables_cents");
  if (/fuel_cents/.test(tile)) f.push("tile reads fuel spend (fuel_cents)");
  if (!/href=\{cardPayablesHref\(/.test(tile) || !/\/accounting\/chart-of-accounts\/register\//.test(fe)) f.push("tile does not drill to the card-payable register");
  if (!/card_payables_cents: cardPayables\.reduce\(/.test(be) || !/await readCardPayableBalances\(client, oc,/.test(be)) f.push("backend no longer sources card payables from readCardPayableBalances");
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [FE, BE]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function selftest() {
  const live = readAll();
  const mut = (key, from, to) => ({ ...live, [key]: live[key].replace(from, to) });
  const cases = [
    ["tile shows spend", mut(FE, "board.data.kpis.card_payables_cents ?? 0", "board.data.kpis.fuel_cents ?? 0")],
    ["no drill", mut(FE, "href={cardPayablesHref(board.data?.card_payables ?? [])}", "")],
    ["backend reader dropped", mut(BE, "await readCardPayableBalances(client, oc,", "await Promise.resolve([] as never, oc,")],
    ["tile deleted", mut(FE, 'testId="vr-kpi-card-payables"', 'testId="vr-kpi-x"')],
  ];
  let pass = 0;
  const liveF = check(live);
  if (liveF.length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, liveF);
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — Vendors "Card payables" = Dreamline/WEX liability from readCardPayableBalances, drills to the register`);
}
