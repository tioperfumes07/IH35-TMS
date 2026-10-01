#!/usr/bin/env node
/**
 * verify-factoring-r315-payments-tabs.mjs
 * ROUND 315 / Lead B4–B5 (2026-10-01):
 *  - Payments to You reads accounting.factoring_purchases (one row per Faro wire), not per-invoice advances
 *  - Debtor Receipts / Invoice Status / Unapplied Cash use formatUsdCents (or fmtCents wrapper) for *_cents
 *    — never a dollars Intl formatter on raw cents (×100 bug)
 *  - Primary SUBNAV removes Account Summary + Request Debtor Credit Check; adds Escrow Account
 *  - Routes + FACTORING_TAB_PATH include /factoring/escrow-account
 *
 * --selftest mutates load-bearing facts and requires FAIL; clean sources PASS.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const PANEL = "apps/frontend/src/pages/factoring/PaymentsToYouPanel.tsx";
const API = "apps/frontend/src/api/factoring-purchases.ts";
const MANIFEST = "apps/frontend/src/router/route-manifest.ts";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";

function analyze(src) {
  const e = [];
  const { home, panel, api, manifest, routes } = src;

  if (!api.includes("listFactoringPurchases") || !api.includes("/api/v1/factoring/purchases?")) {
    e.push("API must export listFactoringPurchases → GET /api/v1/factoring/purchases");
  }
  if (!api.includes("getFactoringPurchase")) {
    e.push("API must export getFactoringPurchase for purchase detail");
  }

  if (!panel.includes("listFactoringPurchases") || !panel.includes("getFactoringPurchase")) {
    e.push("PaymentsToYouPanel must call listFactoringPurchases + getFactoringPurchase");
  }
  if (!panel.includes("formatUsdCents")) {
    e.push("PaymentsToYouPanel must format money via formatUsdCents (shared cents formatter)");
  }
  if (!panel.includes('tableTestId="factoring-payments-to-you-table"') && !panel.includes('data-testid="factoring-payments-to-you-table"')) {
    e.push("PaymentsToYouPanel must render factoring-payments-to-you-table");
  }
  if (!panel.includes("bank_transaction")) {
    e.push("PaymentsToYouPanel must surface bank match via EntityLink kind bank_transaction");
  }

  if (!home.includes('import { PaymentsToYouPanel }')) {
    e.push("FactoringHome must import PaymentsToYouPanel");
  }
  if (!home.includes("<PaymentsToYouPanel")) {
    e.push("FactoringHome payments_to_you tab must mount <PaymentsToYouPanel");
  }

  // Primary SUBNAV: Account Summary + Request Debtor must NOT be in the first SUBNAV const.
  const subnavMatch = home.match(/const SUBNAV = \[([\s\S]*?)\] as const;/);
  if (!subnavMatch) {
    e.push("FactoringHome must declare const SUBNAV = [...] as const");
  } else {
    const sub = subnavMatch[1];
    if (/id:\s*"account_summary"/.test(sub)) {
      e.push("B5: account_summary must leave primary SUBNAV (park under Internal Tools)");
    }
    if (/id:\s*"request_debtor_credit_check"/.test(sub)) {
      e.push("B5: request_debtor_credit_check must leave primary SUBNAV");
    }
    if (!/id:\s*"escrow_account"/.test(sub)) {
      e.push("B5: primary SUBNAV must ADD escrow_account");
    }
  }
  if (!/id:\s*"account_summary"/.test(home) || !/INTERNAL_TOOLS_SUBNAV/.test(home)) {
    e.push("B5: account_summary must remain reachable under INTERNAL_TOOLS_SUBNAV (Rule 07)");
  }

  // ×100: debtor receipts / invoice status / unapplied must not pass *_cents to fmtCurrency.
  const badCentsFmt = [
    /fmtCurrency\(row\.amount_cents\)/,
    /fmtCurrency\(row\.amount_applied_cents\)/,
    /fmtCurrency\(row\.amount_unapplied_cents\)/,
    /fmtCurrency\(row\.total_cents\)/,
    /fmtCurrency\(row\.advance_amount_cents\)/,
    /fmtCurrency\(row\.reserve_amount_cents\)/,
    /fmtCurrency\(row\.factor_fee_cents\)/,
  ];
  for (const re of badCentsFmt) {
    if (re.test(home)) {
      e.push(`×100 bug: ${re} still formats cents with dollars formatter — use fmtCents/formatUsdCents`);
    }
  }
  if (!home.includes("formatUsdCents") && !home.includes("function fmtCents")) {
    e.push("FactoringHome must define fmtCents backed by formatUsdCents");
  }
  if (!home.includes('data-testid="factoring-escrow-account"')) {
    e.push("Escrow Account tab body missing data-testid=factoring-escrow-account");
  }

  if (!manifest.includes('escrow_account: "/factoring/escrow-account"')) {
    e.push("FACTORING_TAB_PATH must include escrow_account → /factoring/escrow-account");
  }
  if (!manifest.includes('return "submit_invoice"') && !/\/factoring"\) return "submit_invoice"/.test(manifest)) {
    // default /factoring → submit_invoice
    if (!/norm === "\/factoring"\) return "submit_invoice"/.test(manifest)) {
      e.push('factoringTabFromPath("/factoring") must default to submit_invoice (not account_summary)');
    }
  }
  if (!routes.includes('path="/factoring/escrow-account"') || !routes.includes('tabId="escrow_account"')) {
    e.push("routes/manifest.tsx must mount /factoring/escrow-account → escrow_account");
  }

  return e;
}

function selftest() {
  const base = {
    home: read(HOME),
    panel: read(PANEL),
    api: read(API),
    manifest: read(MANIFEST),
    routes: read(ROUTES),
  };
  const clean = analyze(base);
  if (clean.length) {
    console.error("verify-factoring-r315-payments-tabs: clean tree FAIL");
    for (const x of clean) console.error(" -", x);
    process.exit(1);
  }

  const mutants = [
    { ...base, home: base.home.replace("PaymentsToYouPanel", "XPanel") },
    { ...base, home: base.home.replace('id: "escrow_account"', 'id: "escrow_gone"') },
    {
      ...base,
      home: base.home.replace(
        /const SUBNAV = \[[\s\S]*?\] as const;/,
        'const SUBNAV = [\n  { id: "account_summary", label: "Account Summary" },\n] as const;'
      ),
    },
    { ...base, home: base.home.replace(/fmtCents\(row\.amount_cents\)/g, "fmtCurrency(row.amount_cents)") },
    { ...base, panel: "" },
    { ...base, manifest: base.manifest.replace('escrow_account: "/factoring/escrow-account"', "") },
  ];
  for (let i = 0; i < mutants.length; i++) {
    const fails = analyze(mutants[i]);
    if (fails.length === 0) {
      console.error(`verify-factoring-r315-payments-tabs: mutant ${i} did not fail`);
      process.exit(1);
    }
  }
  console.log("verify-factoring-r315-payments-tabs: SELFTEST PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  selftest();
} else {
  const fails = analyze({
    home: read(HOME),
    panel: read(PANEL),
    api: read(API),
    manifest: read(MANIFEST),
    routes: read(ROUTES),
  });
  if (fails.length) {
    console.error("verify-factoring-r315-payments-tabs: FAIL");
    for (const x of fails) console.error(" -", x);
    process.exit(1);
  }
  console.log("verify-factoring-r315-payments-tabs: PASS");
}
