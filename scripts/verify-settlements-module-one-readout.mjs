#!/usr/bin/env node
/** @matrix-built {"modules":["settlements"],"cols":["connectivity","settlement"],"leaves":["settlements.list","settlements.panel.tours"],"task":"SETL-MOD-01-ONE-READOUT","vertical":"column-wave"} */
// SETL-MOD-01 guard (ROUND 9, owner "get to work on the real settlements module"). The SETTLEMENTS
// module list must read the SAME readout as the Load-costs Pre-Settlement / Settlement tabs:
// GET /api/v1/driver-finance/tours via listTours() (api/tourReadout.ts), one row per tour, expanded
// to the SAME TourPreSettlementTab / TourSettlementTab keyed by settlement_id, rendered in a
// ParityTable (NOT a raw <table> — go26 consolidation ratchet), with an open/closed filter pill, and
// it is the DEFAULT view of the Settlements tab. The Tour link routes to ?settlement_id= so the
// existing detail view keeps working.
//
// --selftest mutates each load-bearing fact and requires each mutation to FAIL; the real sources pass.
import fs from "node:fs";

const REG = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
const BOARD = "apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx";
const HELPERS = "apps/frontend/src/pages/driver-finance/settlementsHomeBoardHelpers.ts";

function analyze(reg, page, board, helpers) {
  const home = `${page}\n${board}\n${helpers}`;
  const errors = [];

  // 1) SAME readout endpoint as the board.
  if (!/import\s*\{[^}]*\blistTours\b[^}]*\}\s*from\s*["'][^"']*api\/tourReadout["']/.test(reg))
    errors.push("register does not import listTours from api/tourReadout (must read the SAME tours endpoint as the Load-costs board)");
  if (!/listTours\(\s*companyId\s*,\s*"open"\s*\)/.test(reg) || !/listTours\(\s*companyId\s*,\s*"closed"\s*\)/.test(reg))
    errors.push("register must call listTours() for BOTH open and closed tours");

  // 2) ParityTable, never a raw <table> (go26).
  if (!/<ParityTable\b/.test(reg))
    errors.push("register does not render <ParityTable> (one-row-per-tour readout must use the shared table)");
  if (/<table\b/.test(reg))
    errors.push("register contains a raw <table> — forbidden (go26 consolidation ratchet); use ParityTable");

  // 3) Expands to the SAME tour tabs.
  if (!/<TourPreSettlementTab\b/.test(reg))
    errors.push("register does not expand open tours to <TourPreSettlementTab>");
  if (!/<TourSettlementTab\b/.test(reg))
    errors.push("register does not expand closed tours to <TourSettlementTab>");

  // 4) open/closed filter pill.
  if (!/settlements-tours-pill-/.test(reg) || !/\bopen\b/.test(reg) || !/\bclosed\b/.test(reg))
    errors.push("register lacks an open/closed filter pill");

  // 5) Tour link keeps the detail view working.
  if (!/settlements\?settlement_id=/.test(reg))
    errors.push("register Tour link does not route to ?settlement_id= (detail view would break)");

  // 5b) SETL-POST (owner 2026-09-09, "the pre-settlement should be verified and click post … we are
  // missing that button, and that pre-settlement turns to a settlement"): the OPEN pre-settlement
  // register carries a row-level Verify & Post action that reuses the SAME close-tour endpoint
  // (open→closed), gated on the readout's can_close — never a new money path.
  if (!/import\s*\{[^}]*\bcloseTour\b[^}]*\bgetTourReadout\b[^}]*\}\s*from\s*["'][^"']*api\/tourReadout["']/.test(reg))
    errors.push("register does not import closeTour + getTourReadout (Verify & Post must reuse the existing close-tour endpoint)");
  if (!/key:\s*"post"/.test(reg) || !/<PostTourAction\b/.test(reg))
    errors.push("register open view lacks the Post column / PostTourAction (owner's missing 'verify then post' button)");
  if (!/disabled=\{!row\.can_close/.test(reg))
    errors.push("Verify & Post is not gated on row.can_close — a not-ready pre-settlement could post");
  if (!/closeTour\(row\.settlement_id,\s*companyId\)/.test(reg))
    errors.push("PostTourAction does not call closeTour(row.settlement_id, companyId) — must reuse the existing endpoint, not a new money path");

  // 6) 443.280-A — register mounts as own Open/Closed tabs (not under the home board).
  if (!/import\s*\{[^}]*\bSettlementsToursRegister\b[^}]*\}\s*from\s*["']\.\/SettlementsToursRegister["']/.test(page))
    errors.push("SettlementsPage does not import SettlementsToursRegister");
  if (!/<SettlementsToursRegister\b/.test(page))
    errors.push("SettlementsPage does not render SettlementsToursRegister");
  if (!/tabParam === "open"/.test(page) || !/tabParam === "closed"/.test(page))
    errors.push("SettlementsPage activeTab must handle tab=open and tab=closed (443.280-A Open/Closed own tabs)");
  if (!/activeTab === "open" \|\| activeTab === "closed"/.test(page) && !/activeTab === "open" \|\| activeTab === "closed"/.test(page))
    errors.push("SettlementsPage must mount SettlementsToursRegister when activeTab is open or closed");
  if (/settlements-view-toggle/.test(page))
    errors.push("SettlementsPage must not layer Tours/Payments toggle under the home board (443.280-A)");
  // Payments is its own tab; legacy ?view=payments still maps to payments (never deleted).
  if (!/["']payments["']\s*\?\s*["']payments["']\s*:\s*["'](?:tours|settlements)["']/.test(page))
    errors.push("SettlementsPage must keep payments|tours view mapping (payments opt-in / own tab)");

  // BANK-F91507 leftover refuse — Open Driver Bills DataPanel accent (Tailwind slate-500, not house muted)
  if (page.includes("#64748b")) errors.push("SettlementsPage leftover off-scale muted #64748b");
  // BANK-F91540 leftover refuse — filter label + active KPI leftover Tailwind slate-*
  if (page.includes("text-slate-") || page.includes("border-slate-") || page.includes("bg-slate-")) {
    errors.push("SettlementsPage leftover slate class");
  }

  // ROUND 443.280 / 443.326 — Open / Closed FULL board on SettlementsToursRegister (not chromeOnly).
  if (/\bV3Panel\b/.test(reg))
    errors.push("SettlementsToursRegister must not import V3Panel (ROUND 443.326 board grammar)");
  if (!/data-settlements-tours-v3=["']1["']/.test(reg))
    errors.push("SettlementsToursRegister must mark data-settlements-tours-v3 for the V3 Open/Closed boards");
  if (!/Closed settlements/.test(reg) || !/Open tours · pre-settlements/.test(reg))
    errors.push("SettlementsToursRegister panel titles must match Closed / Open board labels");
  if (!/Pre-Settlement \(Open\)/.test(reg) || !/Settlement \(Closed\)/.test(reg))
    errors.push("tour pills must use board labels Pre-Settlement (Open) / Settlement (Closed)");
  if (!/data-testid=["']settlements-tours-v3-panel["']/.test(reg) && !/testId=["']settlements-tours-v3-panel["']/.test(reg))
    errors.push("SettlementsToursRegister must set data-testid=settlements-tours-v3-panel on the board panel");
  // 443.280 FULL — V3KpiTile + MoneyListToolbar + shared BoardSection (docs/design/v3/Settlements-Open|Closed).
  if (!/<V3KpiTile\b/.test(reg) || !/data-settlements-tours-v3-kpis=["']1["']/.test(reg))
    errors.push("SettlementsToursRegister must mount V3KpiTile strip (data-settlements-tours-v3-kpis) on Open/Closed");
  if (!/<MoneyListToolbar\b/.test(reg))
    errors.push("SettlementsToursRegister must mount MoneyListToolbar (board Filters/search)");
  if (!/from ["'].*components\/v3\/BoardSection["']/.test(reg) || !/<BoardSection\b/.test(reg))
    errors.push("SettlementsToursRegister must wrap the table in shared BoardSection");
  if (/function BoardSection\(/.test(reg))
    errors.push("SettlementsToursRegister must not define a local BoardSection extract");


  // ROUND 443.267 — Settlements home board polish (Week-of table · deduction split · Deductions grain).
  // ROUND 443.326 — home board panels/helpers split out of SettlementsPage.tsx; same readout bundle.
  if (!/listAllSettlementDeductions\s*\(/.test(page) && !/listSettlementDeductions\s*\(/.test(page))
    errors.push("Settlements home must call listAllSettlementDeductions (or listSettlementDeductions) for deduction-type split (443.267)");
  if (!/settlements-home-week-of-panel/.test(home))
    errors.push("Settlements home must render Week-of panel (data-testid settlements-home-week-of-panel)");
  if (!/id:\s*"deductions"/.test(home) && !/id:\s*'deductions'/.test(home))
    errors.push("Settlements home week chart grain must include Deductions (board Net|Gross|Deductions)");
  if (!/Advances \(Zelle\)/.test(home) || !/Escrow/.test(home) || !/Fines/.test(home))
    errors.push("Settlements home deductions panel must split Escrow / Advances (Zelle) / Fines");

  // REG-102 / register #102 — Week-of panel must key open/closed pills on trip_closed_at (tour phase), not payment_state.
  if (!/function settlementsRowTourClosed\b/.test(home) || !/trip_closed_at/.test(home))
    errors.push("Settlements home Week-of panel must use settlementsRowTourClosed(trip_closed_at) for open/closed pills (REG-102)");
  if (!/function settlementsWeekOfStatusLabel\b/.test(home))
    errors.push("Settlements home Week-of Status column must use settlementsWeekOfStatusLabel (tour phase, not Paid/Open pay status)");
  if (/weekOfClosedCount[\s\S]{0,120}settlementsRowPayStatus/.test(page))
    errors.push("weekOfClosedCount must not filter on settlementsRowPayStatus === Paid (REG-102)");

  // ROUND 443.274-C — Settlements-Open board (Ready dots · Waiting on · Settlement label · no "Open" status word).
  if (!/function ReadyDots\b/.test(reg) || !/data-testid="setl-tour-ready-dots"/.test(reg))
    errors.push("SettlementsToursRegister must render ReadyDots (data-testid setl-tour-ready-dots) for Open Ready column");
  if (!/label:\s*"Ready"/.test(reg) || !/testId:\s*"setl-tour-col-ready"/.test(reg))
    errors.push('SettlementsToursRegister open view must keep Ready column (label "Ready", testId setl-tour-col-ready)');
  if (!/label:\s*"Waiting on"/.test(reg) || !/testId:\s*"setl-tour-col-open-items"/.test(reg))
    errors.push('SettlementsToursRegister open view must label Waiting on (testId setl-tour-col-open-items kept)');
  if (!/function waitingOnReason\b/.test(reg) || !/close_blockers\[0\]/.test(reg))
    errors.push("Waiting on must be this row's first close_blockers entry only (waitingOnReason)");
  if (!/label:\s*"Settlement"/.test(reg) || /label:\s*"Settlement\/Tour"/.test(reg))
    errors.push('SettlementsToursRegister Settlement column label must be "Settlement" (not Settlement/Tour)');
  // Prefer P-series + refuse Open/PENDING/S-counter (measured board defect: Settlement showed "Open").
  if (!reg.includes("/^P-\\d+/i"))
    errors.push("tourLabel must accept P-series display_id (/^P-\\d+/i)");
  if (!/toLowerCase\(\)\s*!==\s*"open"/.test(reg))
    errors.push("tourLabel must refuse status-word Open");
  if (!/settlements-open-board-footnote/.test(reg))
    errors.push("SettlementsToursRegister open view must render settlements-open-board-footnote");
  if (!/label:\s*"Practical mi"/.test(reg) || !/label:\s*"Real mi"/.test(reg))
    errors.push('SettlementsToursRegister mile columns must use board labels "Practical mi" / "Real mi"');

  // ROUND 443.274-C — Settlements-Closed board (No number · Driver net bold · Company settlement link · footnote).
  if (!/function SettlementCell\b/.test(reg) || !/setl-tour-no-number/.test(reg))
    errors.push("SettlementsToursRegister must render SettlementCell with setl-tour-no-number for closed No number rows");
  if (!/function CompanySettlementCell\b/.test(reg) || !/kind=["']company_settlement["']/.test(reg))
    errors.push("SettlementsToursRegister must link Company settlement via EntityLink kind=company_settlement");
  if (!/setl-tour-company-not-opened/.test(reg) || !/not opened/.test(reg))
    errors.push('Closed Company settlement must keep "not opened" (setl-tour-company-not-opened) when no company settlement');
  if (!/label:\s*"Driver net"/.test(reg) || !/font-bold/.test(reg))
    errors.push("Closed Driver net column must be bold (font-bold)");
  if (!/settlements-closed-board-footnote/.test(reg))
    errors.push("SettlementsToursRegister closed view must render settlements-closed-board-footnote");
  if (!/Settlement number and company settlement number both open their statements/.test(reg))
    errors.push("Closed footnote must state both numbers open their statements");
  if (!/company_settlement_id/.test(reg))
    errors.push("SettlementsToursRegister must read company_settlement_id for the Company settlement link");

  return errors;
}

const reg = fs.readFileSync(REG, "utf8");
const page = fs.readFileSync(PAGE, "utf8");
const board = fs.readFileSync(BOARD, "utf8");
const helpers = fs.readFileSync(HELPERS, "utf8");

if (process.argv.includes("--selftest")) {
  const clean = analyze(reg, page, board, helpers);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["drop listTours import", [reg.replace(/import\s*\{[^}]*\blistTours\b[^}]*\}\s*from\s*["'][^"']*api\/tourReadout["'];?/, ""), page, board, helpers]],
    ["ParityTable -> raw table", [reg.replace("<ParityTable", "<table data-x").replace(/\/>\s*\)}\s*<\/div>\s*\);\s*}\s*$/, "></table> )} </div> ); }"), page, board, helpers]],
    ["remove closed-tour tab", [reg.replace(/<TourSettlementTab\b/g, "<Nope"), page, board, helpers]],
    ["remove pills", [reg.replace(/settlements-tours-pill-/g, "x-removed-"), page, board, helpers]],
    ["break detail link", [reg.replace(/settlements\?settlement_id=/g, "settlements?x="), page, board, helpers]],
    ["page default to payments", [reg, page.replace(/["']payments["']\s*\?\s*["']payments["']\s*:\s*["'](?:tours|settlements)["']/, '"payments" ? "tours" : "payments"'), board, helpers]],
    ["page drops register", [reg, page.replace(/<SettlementsToursRegister\b/g, "<Nope"), board, helpers]],
    ["page drops open tab", [reg, page.replace(/tabParam === "open"/g, 'tabParam === "gone_open"'), board, helpers]],
    ["page drops closed tab", [reg, page.replace(/tabParam === "closed"/g, 'tabParam === "gone_closed"'), board, helpers]],
    ["page restores view toggle under home", [reg, page + '\n<div data-testid="settlements-view-toggle" />\n', board, helpers]],
    ["post action removed", [reg.replace(/<PostTourAction[^>]*\/>/, "null"), page, board, helpers]],
    ["post ungated (can_close bypassed)", [reg.replace("disabled={!row.can_close", "disabled={false && !row.can_close"), page, board, helpers]],
    ["post no longer reuses close-tour endpoint", [reg.replace("closeTour(row.settlement_id, companyId)", "Promise.resolve({})"), page, board, helpers]],
    ["page leftover slate-500", [reg, page + '\n<DataPanel accentColor="#64748b">plant</DataPanel>\n', board, helpers]],
    ["page leftover slate class", [reg, page + '\n<label className="text-xs text-slate-600">plant</label>\n', board, helpers]],
    ["restore forbidden V3Panel", [reg.replace(/testId=["']settlements-tours-v3-panel["']/, 'testId="settlements-tours-v3-panel"\nimport { V3Panel } from "../../components/v3/V3Panel"'), page, board, helpers]],
    ["drop tours-v3 marker", [reg.replace(/data-settlements-tours-v3=["']1["']/, 'data-settlements-tours-legacy="1"'), page, board, helpers]],
    ["drop Closed panel title", [reg.replace(/Closed settlements/g, "Closed list"), page, board, helpers]],
    ["drop Open panel title", [reg.replace(/Open tours · pre-settlements/g, "Open list"), page, board, helpers]],
    ["drop board panel testid", [reg.replace(/testId=["']settlements-tours-v3-panel["']/, 'testId="settlements-tours-legacy"'), page, board, helpers]],
    ["drop board pill labels", [reg.replace(/Pre-Settlement \(Open\)/g, "Open").replace(/Settlement \(Closed\)/g, "Closed"), page, board, helpers]],
    ["drop V3KpiTile strip", [reg.replace(/<V3KpiTile\b/g, "<NopeTile").replace(/data-settlements-tours-v3-kpis=["']1["']/, 'data-settlements-tours-v3-kpis="0"'), page, board, helpers]],
    ["drop MoneyListToolbar", [reg.replace(/<MoneyListToolbar\b/g, "<NopeToolbar"), page, board, helpers]],
    ["drop BoardSection", [reg.replace(/<BoardSection\b/g, "<NopeSection"), page, board, helpers]],
    ["drop week-of panel", [reg, page, board.replace(/settlements-home-week-of-panel/g, "settlements-home-week-legacy"), helpers]],
    ["drop deductions grain", [reg, page, board.replace(/id:\s*"deductions"/g, 'id: "net_x"'), helpers]],
    ["drop listAllSettlementDeductions", [reg, page.replace(/listAllSettlementDeductions/g, "listNope"), board, helpers]],
    ["drop Advances label", [reg, page, board.replace(/Advances \(Zelle\)/g, "Advances"), helpers]],
    ["week-of uses pay status for closed count", [reg, page.replace(/weekOfClosedCount = thisWeekSettlements\.filter\(\(s\) => settlementsRowTourClosed\(s\)(?: && !isEmptyRow\(s\))?\)/, "weekOfClosedCount = thisWeekSettlements.filter((s) => settlementsRowPayStatus(s) === \"Paid\")"), board, helpers]],
    ["drop settlementsRowTourClosed", [reg, page, board, helpers.replace(/function settlementsRowTourClosed\b[\s\S]*?\n}\n\nexport function settlementsWeekOfStatusLabel/, "export function settlementsWeekOfStatusLabel")]],
    ["drop ReadyDots testid", [reg.replace(/setl-tour-ready-dots/g, "setl-tour-ready-gone"), page, board, helpers]],
    ["drop Waiting on label", [reg.replace(/label:\s*"Waiting on"/g, 'label: "Open items"'), page, board, helpers]],
    ["restore Settlement/Tour label", [reg.replace(/label:\s*"Settlement"/, 'label: "Settlement/Tour"'), page, board, helpers]],
    ["drop open footnote", [reg.replace(/settlements-open-board-footnote/g, "settlements-open-legacy"), page, board, helpers]],
    ["drop Practical mi label", [reg.replace(/label:\s*"Practical mi"/g, 'label: "Practical miles"'), page, board, helpers]],
    ["drop SettlementCell / No number", [reg.replace(/function SettlementCell\b/g, "function SettlementCellGone").replace(/setl-tour-no-number/g, "setl-tour-no-num-gone"), page, board, helpers]],
    ["drop CompanySettlementCell link", [reg.replace(/kind=["']company_settlement["']/g, 'kind="settlement"'), page, board, helpers]],
    ["drop closed footnote", [reg.replace(/settlements-closed-board-footnote/g, "settlements-closed-legacy"), page, board, helpers]],
    ["drop Driver net bold", [reg.replace(/font-bold/g, "font-normal"), page, board, helpers]],
  ];
  let caught = 0;
  for (const [label, [r, p, b, h]] of mutations) {
    if (analyze(r, p, b, h).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-settlements-module-one-readout --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(reg, page, board, helpers);
if (failures.length) {
  console.error("FAIL verify-settlements-module-one-readout");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-settlements-module-one-readout");
