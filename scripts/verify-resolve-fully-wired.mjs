#!/usr/bin/env node
/**
 * ROUND 206 — Resolve fully wired (owner asked 4×).
 *
 * Asserts Match drawer + routes expose:
 *  1. differences / write-off account — MatchDrawer passes variance_account_id; write-off picker present
 *  2. partial (non-zero gap) Confirm enabled when write-off selected
 *  3. one bank line → many documents — accept-multi-match route + acceptExactMultiDocumentMatch + FE multi Confirm
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-resolve-fully-wired";

function fail(msg) {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, "utf8");
}

const drawer = read("apps/frontend/src/pages/banking/components/MatchDrawer.tsx");
if (!drawer.includes("variance_account_id")) {
  fail("MatchDrawer must pass variance_account_id on accept (write-off / difference).");
}
if (!drawer.includes("match-drawer-writeoff-account")) {
  fail("MatchDrawer must expose write-off / difference account picker (data-testid).");
}
if (!drawer.includes("acceptBankReconMultiMatch") || !drawer.includes("match-multi-confirm")) {
  fail("MatchDrawer must wire multi-document confirm (one bank line → many documents).");
}
if (drawer.includes("awaiting owner go-ahead to enable Confirm")) {
  fail("MatchDrawer still holds variance behind owner-go-ahead — ROUND 206 unlocked Resolve.");
}

const routes = read("apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts");
if (!routes.includes("/api/v1/bank-recon/accept-multi-match")) {
  fail("recon-worklist.routes must expose POST /api/v1/bank-recon/accept-multi-match");
}
if (!routes.includes("acceptExactMultiDocumentMatch")) {
  fail("accept-multi-match route must call acceptExactMultiDocumentMatch");
}

const api = read("apps/frontend/src/api/banking.ts");
if (!api.includes("acceptBankReconMultiMatch") || !api.includes("accept-multi-match")) {
  fail("banking.ts must export acceptBankReconMultiMatch → accept-multi-match");
}

const matchSvc = read("apps/backend/src/accounting/bank-recon/match.service.ts");
if (!matchSvc.includes("bank_amount_cents")) {
  fail("findCandidates must return bank_amount_cents for multi-doc sum check");
}

console.log(
  `${LABEL}: PASS — write-off account + variance Resolve + multi-document accept wired through MatchDrawer.`
);
process.exit(0);
