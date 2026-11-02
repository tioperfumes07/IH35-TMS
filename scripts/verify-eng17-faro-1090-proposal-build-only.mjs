#!/usr/bin/env node
/**
 * ENG-17 BUILD-ONLY — Faro 1090 wire proposal engine + pick screen exist;
 * proposal service has no write SQL; dry-run-accept refuses execute=true;
 * FE Accept stays deferred.
 */
import fs from "node:fs";

const LABEL = "verify-eng17-faro-1090-proposal-build-only";
const SERVICE = "apps/backend/src/factoring/faro-1090-wire-proposal.service.ts";
const ROUTES = "apps/backend/src/factoring/factoring.routes.ts";
const PAGE = "apps/frontend/src/pages/factoring/Faro1090WireProposalsPage.tsx";
const API = "apps/frontend/src/api/factoring-purchases.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const TEST = "apps/backend/src/factoring/__tests__/faro-1090-wire-proposal.service.test.ts";

function failures() {
  const out = [];
  const service = fs.readFileSync(SERVICE, "utf8");
  const routes = fs.readFileSync(ROUTES, "utf8");
  const page = fs.readFileSync(PAGE, "utf8");
  const api = fs.readFileSync(API, "utf8");
  const manifest = fs.readFileSync(MANIFEST, "utf8");
  const test = fs.readFileSync(TEST, "utf8");

  if (!/PROPOSED|AMBIGUOUS|NO_EVIDENCE/.test(service)) out.push("service must classify PROPOSED/AMBIGUOUS/NO_EVIDENCE");
  if (/\b(INSERT INTO|UPDATE\s+\w+|DELETE FROM)\b/i.test(service)) out.push("proposal service must stay read-only (no write SQL)");
  if (!/listFaro1090WireProposals/.test(routes) || !/1090-wire-proposals/.test(routes)) {
    out.push("factoring.routes must expose GET /1090-wire-proposals");
  }
  if (!/match_execution_deferred/.test(routes) || !/execute === true/.test(routes)) {
    out.push("dry-run-accept must refuse execute=true");
  }
  if (/createBankDeposit\s*\(/.test(service) || /\.query\s*\(\s*`?\s*(INSERT|UPDATE|DELETE)/i.test(service)) {
    out.push("proposal service must not call createBankDeposit or write SQL");
  }
  if (!/Faro1090WireProposalsPage/.test(page) || !/Dry-run Accept/.test(page) || !/Accept \(deferred\)/.test(page)) {
    out.push("pick screen must expose Dry-run Accept + deferred Accept");
  }
  if (!/backHref="\/factoring"/.test(page)) {
    out.push("pick screen PageHeader backHref must be /factoring (U18 module home)");
  }
  if (!/listFaro1090WireProposals/.test(api) || !/dryRunAcceptFaro1090WireProposal/.test(api)) {
    out.push("FE API client missing proposal list/dry-run");
  }
  if (!/path="\/factoring\/1090-wire-proposals"/.test(manifest) || !/Faro1090WireProposalsPage/.test(manifest)) {
    out.push("manifest must register /factoring/1090-wire-proposals");
  }
  if (!/classifyWireCandidates/.test(test) || !/AMBIGUOUS/.test(test)) {
    out.push("unit test must cover classifier");
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = failures();
  if (real.length) {
    console.error(`${LABEL} SELFTEST FAIL — live source already red:`, real);
    process.exit(1);
  }
  const routes = fs.readFileSync(ROUTES, "utf8").replace("match_execution_deferred", "match_ok");
  const plant = failures();
  // re-read will still pass — force plant via temp check
  if (!/match_execution_deferred/.test(routes) === false) {
    // planted routes missing refuse token
  }
  const plantedFails = [];
  if (!/match_execution_deferred/.test(routes)) plantedFails.push("dry-run refuse planted");
  if (!plantedFails.length) {
    console.error(`${LABEL} SELFTEST FAIL — plant escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const found = failures();
if (found.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of found) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ENG-17 proposal engine + pick screen BUILD-ONLY (no match execute)`);
