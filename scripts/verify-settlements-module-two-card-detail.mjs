#!/usr/bin/env node
// SETL-MOD-02 + 443.293-A: Statement tab = eight-section settlement document (not 2×2 board).
// TourSettlementTab two-card readout stays on SettlementStatementWorkflowPage (?workflow=1).
//
// --selftest mutates each load-bearing fact and requires each mutation to FAIL; the real sources pass.
import fs from "node:fs";

const DETAIL = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const WORKFLOW = "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx";
const TAB = "apps/frontend/src/components/dispatch/TourSettlementTab.tsx";
const DOCUMENT = "apps/frontend/src/pages/driver-finance/components/SettlementStatementDocumentBody.tsx";

function analyze(detail, workflow, tab, document) {
  const errors = [];

  // 1) Statement detail mounts the eight-section document body (443.293-A), not the retired 2×2 board.
  if (!/SettlementStatementDocumentBody/.test(detail))
    errors.push("SettlementDetailPage does not mount SettlementStatementDocumentBody (443.293-A document body)");
  if (!/data-settlement-statement-eight-section="1"/.test(document))
    errors.push("SettlementStatementDocumentBody missing data-settlement-statement-eight-section=1");
  if (!/settlement-detail-approved-design/.test(detail))
    errors.push("SettlementDetailPage lacks the approved-design wrapper (data-testid=settlement-detail-approved-design)");
  if (/SettlementStatementBoardPanels/.test(detail))
    errors.push("SettlementDetailPage must not mount SettlementStatementBoardPanels (443.293-A retired the board)");
  if (/TourSettlementTab/.test(detail))
    errors.push("SettlementDetailPage must not mount TourSettlementTab (moved to workflow — 443.280-A)");

  // 2) Workflow keeps TourSettlementTab keyed by settlementId (capability moved off the board).
  if (!/import\s*\{[^}]*\bTourSettlementTab\b[^}]*\}\s*from\s*["'][^"']*dispatch\/TourSettlementTab["']/.test(workflow))
    errors.push("SettlementStatementWorkflowPage does not import TourSettlementTab");
  if (!/<TourSettlementTab\b[^>]*settlementId=\{settlementId\}/.test(workflow))
    errors.push("SettlementStatementWorkflowPage does not render <TourSettlementTab settlementId={settlementId} …>");

  // 3) Document body = KPI grid + loads + waterfall + itemized company + pay sections.
  if (!/<SettlementKpiGrid/.test(document)) errors.push("SettlementStatementDocumentBody missing SettlementKpiGrid");
  if (!/<SettlementLoadsSection/.test(document)) errors.push("SettlementStatementDocumentBody missing SettlementLoadsSection");
  if (!/<CompanyWaterfallSection/.test(document)) errors.push("SettlementStatementDocumentBody missing CompanyWaterfallSection");
  if (!/<CompanySettlementItemizedByLoad/.test(document))
    errors.push("SettlementStatementDocumentBody missing CompanySettlementItemizedByLoad");
  if (!/<EarningsSection/.test(document)) errors.push("SettlementStatementDocumentBody missing EarningsSection");
  if (!/<DeductionsSection/.test(document)) errors.push("SettlementStatementDocumentBody missing DeductionsSection");

  // 4) TourSettlementTab card tokens unchanged (Load-costs Settlement tab + workflow).
  if (!/data-testid="driver-settlement-card"/.test(tab))
    errors.push("TourSettlementTab lacks the driver settlement card");
  if (!/data-testid="company-settlement-card"/.test(tab))
    errors.push("TourSettlementTab lacks the company settlement card");
  if (!/ldt-grid2/.test(tab))
    errors.push("TourSettlementTab does not lay the two cards side by side (ldt-grid2)");
  for (const cls of ["ldt-card", "ldt-ch", "ldt-rows"]) {
    if (!new RegExp(`\\b${cls}\\b`).test(tab)) errors.push(`TourSettlementTab does not use the ${cls} token class`);
  }
  if (/<style\b/.test(tab)) errors.push("TourSettlementTab injects a local <style> (palette must come from tokens-load-detail.css only)");

  if (!/Loaded\b/.test(tab) || !/Empty\b/.test(tab)) errors.push("driver card missing Loaded/Empty line labels");
  if (!/data-testid="driver-gross"/.test(tab)) errors.push("driver card missing Gross line");
  if (!/Escrow/.test(tab)) errors.push("driver card missing Escrow line");
  if (!/Recoveries/.test(tab)) errors.push("driver card missing Recoveries line");
  if (!/5% floor/.test(tab) || !/data-testid="driver-net"/.test(tab)) errors.push("driver card missing Net pay · 5% floor line");

  if (!/Revenue/.test(tab)) errors.push("company card missing Revenue line");
  if (!/Costs/.test(tab)) errors.push("company card missing Costs line");
  if (!/Driver pay/.test(tab)) errors.push("company card missing Driver pay line");
  if (!/Factoring/.test(tab)) errors.push("company card missing Factoring line");
  if (!/data-testid="company-margin"/.test(tab) || !/practical/.test(tab) || !/real/.test(tab))
    errors.push("company card missing Margin with $/mi practical AND real");

  if (!/account_label/.test(tab) || !/no account/.test(tab))
    errors.push("TourSettlementTab does not surface the GL account on each line (account_label / 'no account')");
  if (!/data-testid="settlement-pdf-link"/.test(tab)) errors.push("TourSettlementTab lacks the Settlement PDF link");
  if (!/frozen/.test(tab) || !/reversing entry/.test(tab))
    errors.push("TourSettlementTab lacks the closed=frozen note (corrections are a reversing entry)");

  return errors;
}

const detail = fs.readFileSync(DETAIL, "utf8");
const workflow = fs.readFileSync(WORKFLOW, "utf8");
const tab = fs.readFileSync(TAB, "utf8");
const document = fs.readFileSync(DOCUMENT, "utf8");

if (process.argv.includes("--selftest")) {
  const clean = analyze(detail, workflow, tab, document);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["drop document body mount", [detail.replace(/SettlementStatementDocumentBody/g, "Nope"), workflow, tab, document]],
    ["unmount approved wrapper", [detail.replace(/settlement-detail-approved-design/g, "x-removed"), workflow, tab, document]],
    ["sneak TourSettlementTab onto board", [detail + '\nimport { TourSettlementTab } from "../../components/dispatch/TourSettlementTab";\n', workflow, tab, document]],
    ["sneak board panels back", [detail.replace(/SettlementStatementDocumentBody/g, "SettlementStatementBoardPanels"), workflow, tab, document]],
    ["drop workflow TourSettlementTab", [detail, workflow.replace(/<TourSettlementTab\b[^>]*settlementId=\{settlementId\}[^>]*\/>/, "<Nope />"), tab, document]],
    ["drop company card", [detail, workflow, tab.replace(/data-testid="company-settlement-card"/g, 'data-testid="x"'), document]],
    ["drop ldt-grid2", [detail, workflow, tab.replace(/ldt-grid2/g, "x-grid"), document]],
    ["drop KPI grid from document", [detail, workflow, tab, document.replace("<SettlementKpiGrid", "<Nope")]],
  ];
  let caught = 0;
  for (const [label, args] of mutations) {
    if (analyze(...args).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-settlements-module-two-card-detail --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(detail, workflow, tab, document);
if (failures.length) {
  console.error("FAIL verify-settlements-module-two-card-detail");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-settlements-module-two-card-detail");
