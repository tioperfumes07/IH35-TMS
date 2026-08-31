#!/usr/bin/env node
/**
 * BANK-ORPHAN-01 BACKFILL. void.service.ts's postVoidReversal now un-matches a bank transaction
 * unconditionally on every FUTURE void (ACCT-F10189), but the 4 documents cited in the owner's
 * original report voided BEFORE that fix shipped -- there is no future void event left for them to
 * ride, so the fix alone cannot reach them. This guard locks the shape the reach-back backfill
 * requires: dry-run is read-only (never writes), apply requires the SAME canVoid gate (Owner/
 * Accountant) every other void action in this codebase uses, requires an explicit typed
 * confirmation + stated reason, reuses the shared unmatchBankTransactionById primitive (no new
 * un-match SQL invented in the route), and writes its own top-level audit event.
 *
 *   node scripts/verify-bank-orphan-backfill-authorized-path.mjs
 *   node scripts/verify-bank-orphan-backfill-authorized-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-orphan-backfill-authorized-path";
const ROUTES_FILE = "apps/backend/src/banking/bank-orphan-backfill.routes.ts";
const SERVICE_FILE = "apps/backend/src/banking/bank-orphan-backfill.service.ts";
const INDEX_FILE = "apps/backend/src/index.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(routesSrc, serviceSrc, indexSrc) {
  const errs = [];
  if (!routesSrc) return [`${ROUTES_FILE}: missing`];
  if (!serviceSrc) errs.push(`${SERVICE_FILE}: missing`);

  if (!/app\.get\(\s*\n?\s*"\/api\/v1\/banking\/bank-orphan-backfill\/dry-run"/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: the dry-run route must exist`);
  }
  if (!/app\.post\(\s*\n?\s*"\/api\/v1\/banking\/bank-orphan-backfill\/apply"/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: the apply route must exist — a hard 'cannot be mutated' dead end for a real orphan is the defect this closes`);
  }
  if (!/apply:\s*false/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: dry-run must hardcode apply: false so it can never write`);
  }
  if (!/confirm:\s*z\.literal\(true\)/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: apply body must require confirm: z.literal(true), not a bare boolean`);
  }
  if (!/reason:\s*z\.string\(\)[^;]*\.min\(1\)/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: apply body must require a non-empty reason`);
  }
  if (!/canVoid\(role\)/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: apply must be gated by the shared void.service.ts canVoid (Owner+Accountant), not a locally re-declared role set`);
  }
  if (!/apply:\s*true/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: apply route must actually pass apply: true through to the service`);
  }
  if (!/appendCrudAudit\(/.test(routesSrc) || !/bank_orphan_backfill\.applied/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: apply must write its own top-level audit event`);
  }
  if (!/runBankOrphanBackfill\(/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: must reuse runBankOrphanBackfill — never invent new un-match SQL in the route`);
  }

  if (serviceSrc) {
    if (!/unmatchBankTransactionById\(/.test(serviceSrc)) {
      errs.push(`${SERVICE_FILE}: must reuse the shared unmatchBankTransactionById primitive, not a bespoke bank_transactions UPDATE`);
    }
    if (!/source_bank_transaction_id/.test(serviceSrc) || !/linked_entity_id/.test(serviceSrc)) {
      errs.push(`${SERVICE_FILE}: sweep must check BOTH pointer shapes (reverse source_bank_transaction_id and forward linked_entity_id) — the 4 live orphans had linked_entity_id NULL, so a forward-only sweep would miss them`);
    }
    if (!/apply === true/.test(serviceSrc)) {
      errs.push(`${SERVICE_FILE}: default mode must be dry-run (apply !== true means zero writes)`);
    }
  }

  if (!indexSrc || !/registerBankOrphanBackfillRoutes\(app\)/.test(indexSrc)) {
    errs.push(`${INDEX_FILE}: registerBankOrphanBackfillRoutes must be wired into route registration — an unregistered route is unreachable`);
  }

  return errs;
}

function selftest() {
  const goodRoutes = read(ROUTES_FILE) ?? "";
  const goodService = read(SERVICE_FILE) ?? "";
  const goodIndex = read(INDEX_FILE) ?? "";
  const goodErrs = assertGuard(goodRoutes, goodService, goodIndex);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["bad1-dry-run-can-write", assertGuard(goodRoutes.replace(/apply:\s*false/g, "apply: true"), goodService, goodIndex)],
    ["bad2-no-confirm", assertGuard(goodRoutes.replace(/confirm:\s*z\.literal\(true\)/g, "confirm: z.boolean()"), goodService, goodIndex)],
    ["bad3-no-role-gate", assertGuard(goodRoutes.replace(/canVoid\(role\)/g, "true"), goodService, goodIndex)],
    ["bad4-apply-not-passed-through", assertGuard(goodRoutes.replace(/apply:\s*true,/g, "apply: false,"), goodService, goodIndex)],
    ["bad5-no-audit", assertGuard(goodRoutes.replace(/bank_orphan_backfill\.applied/g, "bank_orphan_backfill_XXX"), goodService, goodIndex)],
    ["bad6-not-reused", assertGuard(goodRoutes.replace(/runBankOrphanBackfill\(/g, "runBankOrphanBackfillXXX("), goodService, goodIndex)],
    ["bad7-not-registered", assertGuard(goodRoutes, goodService, goodIndex.replace(/registerBankOrphanBackfillRoutes\(app\)/g, "// removed"))],
    ["bad8-forward-only-sweep", assertGuard(goodRoutes, goodService.replace(/linked_entity_id/g, "REMOVED_COL"), goodIndex)],
  ];

  for (const [name, res] of mutations) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS ${mutations.length}/${mutations.length} mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard(read(ROUTES_FILE), read(SERVICE_FILE), read(INDEX_FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — bank-orphan backfill has a real Owner/Accountant-gated apply path, dry-run cannot write, reuses the shared un-match primitive, and is registered`);
