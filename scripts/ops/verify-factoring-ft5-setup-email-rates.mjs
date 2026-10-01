#!/usr/bin/env node
/**
 * verify-factoring-ft5-setup-email-rates.mjs
 * FACTORING-TAKEOVER FT5 (2026-10-01):
 *  - Factor Setup / profile shows submission email (Faro purchase-report recipient)
 *  - Both reserve rates (escrow reserve_rate + cash_reserve_rate) display via rateToPctString
 *  - Edit form persists submissionEmail → remittance_details + cash_reserve_rate column
 *  - No DB submission_email column — remittance_details JSON is the SoT
 *
 * --selftest mutates load-bearing facts and requires FAIL; clean sources PASS.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const PANEL = "apps/frontend/src/pages/factoring/FactoringProfilePanel.tsx";
const LIB = "apps/frontend/src/lib/factorProfile.ts";
const FACTOR_SVC = "apps/backend/src/factoring/factor.service.ts";

function analyze(src) {
  const e = [];
  const { home, panel, lib, factorSvc } = src;

  if (!lib.includes("submissionEmail") || !lib.includes("cashReserveRatePct")) {
    e.push("factorProfile must model submissionEmail + cashReserveRatePct");
  }
  if (!lib.includes("rateToPctString") || !lib.includes('toFixed(2)')) {
    e.push("rateToPctString must use toFixed(2) for 1.50% display");
  }
  if (!lib.includes("remittance_details") && !lib.includes("submissionEmail: form.submissionEmail")) {
    e.push("factorProfile patch must write submissionEmail into remittance_details");
  }
  if (!lib.includes("submissionEmail: form.submissionEmail.trim()")) {
    e.push("buildFactorPatch must persist submissionEmail.trim() into remittance_details");
  }

  if (!panel.includes("Submission email") && !panel.includes("submissionEmail")) {
    e.push("FactoringProfilePanel must display submission email");
  }
  if (!panel.includes("factoring-profile-submission-email-display") && !panel.includes("Submission email")) {
    e.push("FactoringProfilePanel must surface submission email on compact and/or full fields");
  }
  if (!panel.includes("cash_reserve_rate") || !panel.includes("reserve_rate")) {
    e.push("FactoringProfilePanel must show both escrow reserve_rate and cash_reserve_rate");
  }
  if (!panel.includes("rateToPctString")) {
    e.push("FactoringProfilePanel rates must use rateToPctString");
  }

  if (!home.includes('data-testid="factoring-profile-submission-email"')) {
    e.push("FactoringHome edit form must have factoring-profile-submission-email input");
  }
  if (!home.includes("cash_reserve_rate: patch.cash_reserve_rate")) {
    e.push("FactoringHome updateFactor must persist cash_reserve_rate from profile patch");
  }
  if (!home.includes("submissionEmail")) {
    e.push("FactoringHome profile edit must bind submissionEmail");
  }

  if (!factorSvc.includes("cash_reserve_rate")) {
    e.push("factor.service must read/write cash_reserve_rate column");
  }
  if (!factorSvc.includes("remittance_details")) {
    e.push("factor.service must persist remittance_details (submission email SoT)");
  }

  return e;
}

function selftest() {
  const base = {
    home: read(HOME),
    panel: read(PANEL),
    lib: read(LIB),
    factorSvc: read(FACTOR_SVC),
  };
  const clean = analyze(base);
  if (clean.length) {
    console.error("verify-factoring-ft5-setup-email-rates: clean FAIL", clean);
    process.exit(1);
  }
  const mutants = [
    { ...base, panel: base.panel.replaceAll("submissionEmail", "X").replaceAll("Submission email", "X") },
    { ...base, home: base.home.replace("cash_reserve_rate: patch.cash_reserve_rate", "cash_reserve_rate: 0") },
    { ...base, lib: base.lib.replace("toFixed(2)", "String") },
    { ...base, home: base.home.replace('data-testid="factoring-profile-submission-email"', 'data-testid="gone"') },
  ];
  for (let i = 0; i < mutants.length; i++) {
    if (analyze(mutants[i]).length === 0) {
      console.error(`verify-factoring-ft5-setup-email-rates: mutant ${i} did not fail`);
      process.exit(1);
    }
  }
  console.log("verify-factoring-ft5-setup-email-rates: SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const fails = analyze({
    home: read(HOME),
    panel: read(PANEL),
    lib: read(LIB),
    factorSvc: read(FACTOR_SVC),
  });
  if (fails.length) {
    console.error("verify-factoring-ft5-setup-email-rates: FAIL");
    for (const x of fails) console.error(" -", x);
    process.exit(1);
  }
  console.log("verify-factoring-ft5-setup-email-rates: PASS");
}
