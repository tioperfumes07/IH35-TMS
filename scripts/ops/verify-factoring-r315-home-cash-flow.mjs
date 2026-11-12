#!/usr/bin/env node
/**
 * verify-factoring-r315-home-cash-flow.mjs — ROUND 315 / Lead B6 → ROUND 8.19 OVERHAUL retarget
 *
 * Was: FactoringHome mounts FactoringCashFlowPanel (TOTAL PER DAY + projected candidates).
 * Now: that panel is DELETED (layered under Purchase report). Account-summary FactoringHomeBoard
 * owns the purchase chart (all periods, value axis, source drill). Negative control: Home must
 * not remount FactoringCashFlowPanel.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const BOARD = "apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx";

function analyze(src) {
  const e = [];
  const { home, board } = src;
  if (home.includes("<FactoringCashFlowPanel")) {
    e.push("FactoringHome must NOT mount <FactoringCashFlowPanel (ROUND 8.19 OVERHAUL)");
  }
  if (!board.includes('data-testid="factoring-home-purchase-chart"') && !board.includes("factoring-home-purchase-chart")) {
    e.push("FactoringHomeBoard must render factoring-home-purchase-chart");
  }
  if (!board.includes("factoring-home-purchase-chart-axis")) {
    e.push("FactoringHomeBoard purchase chart must expose a value axis (factoring-home-purchase-chart-axis)");
  }
  if (!/listFactoringPurchases/.test(board)) {
    e.push("FactoringHomeBoard must read listFactoringPurchases for the purchase chart");
  }
  return e;
}

function selftest() {
  const base = {
    home: fs.readFileSync(HOME, "utf8"),
    board: fs.readFileSync(BOARD, "utf8"),
  };
  const clean = analyze(base);
  if (clean.length) {
    console.error("verify-factoring-r315-home-cash-flow: clean FAIL", clean);
    process.exit(1);
  }
  const mutants = [
    { ...base, home: base.home.replace("<DuplicateVendorsBanner", "<FactoringCashFlowPanel companyId={companyId} /><DuplicateVendorsBanner") },
    { ...base, board: base.board.replaceAll("factoring-home-purchase-chart", "factoring-home-purchase-gone") },
    { ...base, board: base.board.replaceAll("listFactoringPurchases", "listGonePurchases") },
  ];
  for (let i = 0; i < mutants.length; i++) {
    if (analyze(mutants[i]).length === 0) {
      console.error(`verify-factoring-r315-home-cash-flow: mutant ${i} did not fail`);
      process.exit(1);
    }
  }
  console.log("verify-factoring-r315-home-cash-flow: SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const fails = analyze({
    home: fs.readFileSync(HOME, "utf8"),
    board: fs.readFileSync(BOARD, "utf8"),
  });
  if (fails.length) {
    console.error("verify-factoring-r315-home-cash-flow: FAIL");
    for (const x of fails) console.error(" -", x);
    process.exit(1);
  }
  console.log("verify-factoring-r315-home-cash-flow: PASS");
}
