#!/usr/bin/env node
/**
 * ENG-17 BUILD-ONLY — Faro 1090 wire proposal engine + pick screen exist;
 * proposal service has no write SQL; dry-run-accept refuses execute=true;
 * FE Accept stays deferred.
 *
 * Codex batch72 — --selftest must inject fixtures into failures() (the real
 * validator), not a separate regex that never sees the planted routes.
 */
import fs from "node:fs";

const LABEL = "verify-eng17-faro-1090-proposal-build-only";
const SERVICE = "apps/backend/src/factoring/faro-1090-wire-proposal.service.ts";
const ROUTES = "apps/backend/src/factoring/factoring.routes.ts";
const PAGE = "apps/frontend/src/pages/factoring/Faro1090WireProposalsPage.tsx";
const API = "apps/frontend/src/api/factoring-purchases.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const TEST = "apps/backend/src/factoring/__tests__/faro-1090-wire-proposal.service.test.ts";

/** @param {Record<string, string>} planted optional path→source overrides for selftest */
export function failures(planted = {}) {
  const out = [];
  const read = (rel) => (Object.prototype.hasOwnProperty.call(planted, rel) ? planted[rel] : fs.readFileSync(rel, "utf8"));
  const service = read(SERVICE);
  const routes = read(ROUTES);
  const page = read(PAGE);
  const api = read(API);
  const manifest = read(MANIFEST);
  const test = read(TEST);

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
  if (/bank_transaction_id\.slice\(0,\s*8\)/.test(page) || /factoring_advance_id\.slice\(0,\s*8\)/.test(page)) {
    out.push("dry-run note must not show UUID slices as labels");
  }
  if (!/selected bank transaction/.test(page) || !/factoring advance/.test(page)) {
    out.push("dry-run note must name bank transaction + factoring advance in words");
  }
  if (!/backHref="\/factoring"/.test(page)) {
    out.push("pick screen PageHeader backHref must be /factoring (U18 module home)");
  }
  if (!/testId="faro-1090-need-company"/.test(page) || !/BoardSection/.test(page)) {
    out.push("pick screen must BoardSection need-company when operating company missing");
  }
  if (!/formatQuantityTable\(row\.days_unfunded\)/.test(page)) {
    out.push("days unfunded must use formatQuantityTable");
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
  const routesGood = fs.readFileSync(ROUTES, "utf8");
  const routesPlant = routesGood
    .replaceAll("match_execution_deferred", "match_ok")
    .replaceAll("execute === true", "execute == true");
  if (routesPlant === routesGood) {
    console.error(`${LABEL} SELFTEST FAIL — could not plant dry-run-refuse tokens`);
    process.exit(1);
  }
  const planted = failures({ [ROUTES]: routesPlant });
  if (!planted.some((m) => /refuse execute=true/.test(m))) {
    console.error(`${LABEL} SELFTEST FAIL — plant escaped failures():`, planted);
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
