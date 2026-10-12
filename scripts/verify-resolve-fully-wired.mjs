#!/usr/bin/env node
/**
 * ROUND 206 — Resolve fully wired (owner asked 4×).
 *
 * Asserts Match drawer + routes expose:
 *  1. differences / write-off account — MatchDrawer passes variance_account_id; write-off picker present
 *  2. partial (non-zero gap) Confirm enabled when write-off selected
 *  3. one bank line → many documents — accept-multi-match route + acceptExactMultiDocumentMatch + FE multi Confirm
 * --selftest plants each violation into copies of the real sources (no database).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-resolve-fully-wired";
const F = {
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  routes: "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts",
  api: "apps/frontend/src/api/banking.ts",
  matchSvc: "apps/backend/src/accounting/bank-recon/match.service.ts",
};

/** The rule, pure: the FIRST failure message (the guard always stopped at the first), or null. */
export function resolveWiringFailure(src) {
  const { drawer, routes, api, matchSvc } = src;
  if (!drawer.includes("variance_account_id")) return "MatchDrawer must pass variance_account_id on accept (write-off / difference).";
  if (!drawer.includes("match-drawer-writeoff-account")) return "MatchDrawer must expose write-off / difference account picker (data-testid).";
  if (!drawer.includes("match-drawer-named-resolve-picks") || !drawer.includes("NAMED_RESOLVE_QUICK_PICKS")) {
    return "MatchDrawer must expose named Resolve quick-picks (Reserve/Fees/Wire/Chargeback) — never generic adjustment only.";
  }
  if (!drawer.includes("acceptBankReconMultiMatch") || !drawer.includes("match-multi-confirm")) {
    return "MatchDrawer must wire multi-document confirm (one bank line → many documents).";
  }
  if (drawer.includes("awaiting owner go-ahead to enable Confirm")) return "MatchDrawer still holds variance behind owner-go-ahead — ROUND 206 unlocked Resolve.";
  if (!routes.includes("/api/v1/bank-recon/accept-multi-match")) return "recon-worklist.routes must expose POST /api/v1/bank-recon/accept-multi-match";
  if (!routes.includes("acceptExactMultiDocumentMatch")) return "accept-multi-match route must call acceptExactMultiDocumentMatch";
  if (!api.includes("acceptBankReconMultiMatch") || !api.includes("accept-multi-match")) return "banking.ts must export acceptBankReconMultiMatch → accept-multi-match";
  if (!matchSvc.includes("bank_amount_cents")) return "findCandidates must return bank_amount_cents for multi-doc sum check";
  return null;
}

function fail(msg) {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, "utf8");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (process.argv.includes("--selftest")) {
    const plant = (k, from, to) => ({ ...src, [k]: src[k].split(from).join(to) });
    const cases = [
      ["the real sources pass", resolveWiringFailure(src) === null],
      ["a drawer without variance_account_id fails", resolveWiringFailure(plant("drawer", "variance_account_id", "x")) !== null],
      ["a drawer without the named Resolve picks fails", resolveWiringFailure(plant("drawer", "NAMED_RESOLVE_QUICK_PICKS", "x")) !== null],
      ["a drawer gated on owner go-ahead fails", resolveWiringFailure({ ...src, drawer: `${src.drawer}\n// awaiting owner go-ahead to enable Confirm` }) !== null],
      ["routes without accept-multi-match fail", resolveWiringFailure(plant("routes", "/api/v1/bank-recon/accept-multi-match", "/x")) !== null],
      ["a match service without bank_amount_cents fails", resolveWiringFailure(plant("matchSvc", "bank_amount_cents", "x")) !== null],
    ];
    for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failure = resolveWiringFailure(src);
  if (failure) fail(failure);
  console.log(
    `${LABEL}: PASS — write-off account + variance Resolve + multi-document accept wired through MatchDrawer.`
  );
  process.exit(0);
}
