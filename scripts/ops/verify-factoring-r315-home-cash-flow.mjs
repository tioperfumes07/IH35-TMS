#!/usr/bin/env node
/**
 * verify-factoring-r315-home-cash-flow.mjs — ROUND 315 / Lead B6
 * Home mounts FactoringCashFlowPanel; panel TOTAL PER DAY from listFactoringPurchases +
 * listPurchaseCandidates; money via formatUsdCents.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const PANEL = "apps/frontend/src/pages/factoring/FactoringCashFlowPanel.tsx";

function analyze(src) {
  const e = [];
  const { home, panel } = src;
  if (!home.includes("FactoringCashFlowPanel") || !home.includes("<FactoringCashFlowPanel")) {
    e.push("FactoringHome must mount <FactoringCashFlowPanel");
  }
  if (!panel.includes("listFactoringPurchases") || !panel.includes("listPurchaseCandidates")) {
    e.push("CashFlowPanel must read purchases + candidates (CC-2 engines)");
  }
  if (!panel.includes("formatUsdCents")) {
    e.push("CashFlowPanel must use formatUsdCents");
  }
  if (!panel.includes('data-testid="factoring-home-cash-flow"')) {
    e.push("CashFlowPanel missing data-testid=factoring-home-cash-flow");
  }
  if (!panel.includes("TOTAL PER DAY") && !panel.includes("TOTAL PER DAY".toLowerCase()) && !/TOTAL PER DAY/i.test(panel)) {
    e.push("CashFlowPanel must label TOTAL PER DAY");
  }
  if (!panel.includes("kind: \"posted\"") && !panel.includes('kind: "posted"')) {
    e.push("CashFlowPanel must distinguish posted vs projected days");
  }
  return e;
}

function selftest() {
  const base = {
    home: fs.readFileSync(HOME, "utf8"),
    panel: fs.readFileSync(PANEL, "utf8"),
  };
  const clean = analyze(base);
  if (clean.length) {
    console.error("verify-factoring-r315-home-cash-flow: clean FAIL", clean);
    process.exit(1);
  }
  const mutants = [
    { ...base, home: base.home.replaceAll("FactoringCashFlowPanel", "X") },
    { ...base, panel: base.panel.replaceAll("listFactoringPurchases", "listX") },
    { ...base, panel: base.panel.replaceAll("formatUsdCents", "fmtCurrency") },
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
    panel: fs.readFileSync(PANEL, "utf8"),
  });
  if (fails.length) {
    console.error("verify-factoring-r315-home-cash-flow: FAIL");
    for (const x of fails) console.error(" -", x);
    process.exit(1);
  }
  console.log("verify-factoring-r315-home-cash-flow: PASS");
}
