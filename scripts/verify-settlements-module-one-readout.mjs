#!/usr/bin/env node
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

function analyze(reg, page) {
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

  // 6) Page mounts the register AS THE DEFAULT view.
  if (!/import\s*\{[^}]*\bSettlementsToursRegister\b[^}]*\}\s*from\s*["']\.\/SettlementsToursRegister["']/.test(page))
    errors.push("SettlementsPage does not import SettlementsToursRegister");
  if (!/<SettlementsToursRegister\b/.test(page))
    errors.push("SettlementsPage does not render SettlementsToursRegister");
  // default view is tours: the ternary yields "tours" unless ?view=payments.
  if (!/["']payments["']\s*\?\s*["']payments["']\s*:\s*["']tours["']/.test(page))
    errors.push("SettlementsPage default view is not 'tours' (must default to the tour readout, payments is the opt-in)");

  // BANK-F91507 leftover refuse — Open Driver Bills DataPanel accent (Tailwind slate-500, not house muted)
  if (page.includes("#64748b")) errors.push("SettlementsPage leftover off-scale muted #64748b");
  // BANK-F91540 leftover refuse — filter label + active KPI leftover Tailwind slate-*
  if (page.includes("text-slate-") || page.includes("border-slate-") || page.includes("bg-slate-")) {
    errors.push("SettlementsPage leftover slate class");
  }

  // ROUND 443.250 — Open / Closed V3 board chrome on SettlementsToursRegister (piggyback EVEN 3348).
  // KPIs already live on Settlements home (data-settlements-v3-kpis); this register is the board delta.
  if (!/import\s*\{[^}]*\bV3Panel\b[^}]*\}\s*from\s*["'][^"']*components\/v3\/V3Panel["']/.test(reg))
    errors.push("SettlementsToursRegister must import V3Panel (ROUND 443.250 Open/Closed V3)");
  if (!/data-settlements-tours-v3=["']1["']/.test(reg))
    errors.push("SettlementsToursRegister must mark data-settlements-tours-v3 for the V3 Open/Closed boards");
  if (!/Closed settlements/.test(reg) || !/Open tours · pre-settlements/.test(reg))
    errors.push("SettlementsToursRegister V3Panel titles must match Closed / Open board labels");
  if (!/Pre-Settlement \(Open\)/.test(reg) || !/Settlement \(Closed\)/.test(reg))
    errors.push("tour pills must use board labels Pre-Settlement (Open) / Settlement (Closed)");
  if (!/testId=["']settlements-tours-v3-panel["']/.test(reg) && !/testId=\{?"settlements-tours-v3-panel"?\}/.test(reg))
    errors.push("SettlementsToursRegister must set testId=settlements-tours-v3-panel on V3Panel");


  // ROUND 443.267 — Settlements home board polish (Week-of table · deduction split · Deductions grain).
  if (!/listSettlementDeductions/.test(page))
    errors.push("SettlementsPage must call listSettlementDeductions for home deduction-type split (443.267)");
  if (!/settlements-home-week-of-panel/.test(page))
    errors.push("SettlementsPage must render Week-of panel (data-testid settlements-home-week-of-panel)");
  if (!/id:\s*"deductions"/.test(page) && !/id:\s*'deductions'/.test(page))
    errors.push("SettlementsPage week chart grain must include Deductions (board Net|Gross|Deductions)");
  if (!/Advances \(Zelle\)/.test(page) || !/Escrow/.test(page) || !/Fines/.test(page))
    errors.push("SettlementsPage deductions panel must split Escrow / Advances (Zelle) / Fines");

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

  return errors;
}

const reg = fs.readFileSync(REG, "utf8");
const page = fs.readFileSync(PAGE, "utf8");

if (process.argv.includes("--selftest")) {
  const clean = analyze(reg, page);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["drop listTours import", [reg.replace(/import\s*\{[^}]*\blistTours\b[^}]*\}\s*from\s*["'][^"']*api\/tourReadout["'];?/, ""), page]],
    ["ParityTable -> raw table", [reg.replace("<ParityTable", "<table data-x").replace(/\/>\s*\)}\s*<\/div>\s*\);\s*}\s*$/, "></table> )} </div> ); }"), page]],
    ["remove closed-tour tab", [reg.replace(/<TourSettlementTab\b/g, "<Nope"), page]],
    ["remove pills", [reg.replace(/settlements-tours-pill-/g, "x-removed-"), page]],
    ["break detail link", [reg.replace(/settlements\?settlement_id=/g, "settlements?x="), page]],
    ["page default to payments", [reg, page.replace(/["']payments["']\s*\?\s*["']payments["']\s*:\s*["']tours["']/, '"payments" ? "tours" : "payments"')]],
    ["page drops register", [reg, page.replace(/<SettlementsToursRegister\b/g, "<Nope")]],
    ["post action removed", [reg.replace(/<PostTourAction[^>]*\/>/, "null"), page]],
    ["post ungated (can_close bypassed)", [reg.replace("disabled={!row.can_close", "disabled={false && !row.can_close"), page]],
    ["post no longer reuses close-tour endpoint", [reg.replace("closeTour(row.settlement_id, companyId)", "Promise.resolve({})"), page]],
    ["page leftover slate-500", [reg, page + '\n<DataPanel accentColor="#64748b">plant</DataPanel>\n']],
    ["page leftover slate class", [reg, page + '\n<label className="text-xs text-slate-600">plant</label>\n']],
    ["drop V3Panel import", [reg.replace(/import\s*\{[^}]*\bV3Panel\b[^}]*\}\s*from\s*["'][^"']*components\/v3\/V3Panel["'];?/, ""), page]],
    ["drop tours-v3 marker", [reg.replace(/data-settlements-tours-v3=["']1["']/, 'data-settlements-tours-legacy="1"'), page]],
    ["drop Closed panel title", [reg.replace(/Closed settlements/g, "Closed list"), page]],
    ["drop Open panel title", [reg.replace(/Open tours · pre-settlements/g, "Open list"), page]],
    ["drop board pill labels", [reg.replace(/Pre-Settlement \(Open\)/g, "Open").replace(/Settlement \(Closed\)/g, "Closed"), page]],
    ["drop week-of panel", [reg, page.replace(/settlements-home-week-of-panel/g, "settlements-home-week-legacy")]],
    ["drop deductions grain", [reg, page.replace(/id:\s*"deductions"/g, 'id: "net_x"')]],
    ["drop listSettlementDeductions", [reg, page.replace(/listSettlementDeductions/g, "listNope")]],
    ["drop Advances label", [reg, page.replace(/Advances \(Zelle\)/g, "Advances")]],
    ["drop ReadyDots testid", [reg.replace(/setl-tour-ready-dots/g, "setl-tour-ready-gone"), page]],
    ["drop Waiting on label", [reg.replace(/label:\s*"Waiting on"/g, 'label: "Open items"'), page]],
    ["restore Settlement/Tour label", [reg.replace(/label:\s*"Settlement"/, 'label: "Settlement/Tour"'), page]],
    ["drop open footnote", [reg.replace(/settlements-open-board-footnote/g, "settlements-open-legacy"), page]],
    ["drop Practical mi label", [reg.replace(/label:\s*"Practical mi"/g, 'label: "Practical miles"'), page]],
  ];
  let caught = 0;
  for (const [label, [r, p]] of mutations) {
    if (analyze(r, p).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-settlements-module-one-readout --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(reg, page);
if (failures.length) {
  console.error("FAIL verify-settlements-module-one-readout");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-settlements-module-one-readout");
