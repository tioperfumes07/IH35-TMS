#!/usr/bin/env node
/**
 * Static guard: NO ORPHANED ROUTES.
 *
 * A recurring bug class in this repo: a route file exports `register*Routes(app)` but it is never
 * actually registered (neither in apps/backend/src/index.ts nor transitively via an aggregator that
 * is registered). The endpoints then 404 in prod while looking "built". A codebase sweep in 2026-06
 * found 22 such orphans (e.g. safety damage photos, EDI, maintenance catalogs, load profitability).
 *
 * This guard fails CI if any exported `register*Routes` function has NO call site anywhere in the
 * backend source — UNLESS it is on the explicit ALLOWLIST below (intentional dead code, held
 * financial surface awaiting owner sign-off, or in-flight mount PRs). New routes that are built but
 * never wired now fail CI until they are either mounted or explicitly allowlisted with a reason.
 *
 * Call detection resolves import aliases: `import { foo as bar } ... bar(app)` counts as a call to
 * `foo`. This avoids false positives for routes mounted under an alias.
 *
 * Per locked rule: "every bug fix gets a static CI guard."
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "apps/backend/src";

// Orphans that are KNOWN and intentionally not (yet) mounted. Remove an entry once its route is
// mounted. Each MUST have a reason. New orphans NOT in this list fail the guard.
const ALLOWLIST = new Map([
  // --- Dead code: built then abandoned, no frontend caller (leave unmounted) ---
  ["registerBankingManualJeRoutes", "ARCHIVED 2026-06-24 (Tier-1 H-1) — dead path, unmounted; original in manual-je.routes.deprecated.ts. Canonical JE = /api/v1/accounting/journal-entries."],
  ["registerDeepHealthRoutes", "ARCHIVED 2026-07-26 — was never mounted (GET /api/v1/healthz/deep 404s in prod), and its handler reads tables that do not exist. Deliberately NOT given auth: adding a guard would have resurrected dead code against a phantom schema. Unmounted + archived is the safe state; verify-step 1590 asserts it stays unauthenticated-unreachable."],
  // registerAccountingReconciliationRoutes — MOUNTED via @fastify/autoload default `fp(...)`
  // export (accounting/reconciliation.routes.ts); "dead code" was stale — live frontend callers
  // in apps/frontend/src/api/accounting.ts hit /api/v1/accounting/reconciliation/{workspace,
  // match,unmatch}.
  ["registerSafetyDrugPoolRoutes", "dead code — no frontend caller"],
  ["registerSamsaraMasterSyncRoutes", "dead code / admin-only — no frontend caller"],
  // registerScheduledReportsRoutes — MOUNTED (apps/backend/src/index.ts:963, direct call) with a
  // live frontend caller (apps/frontend/src/api/scheduled-reports.ts); "dead code" was stale.
  // registerCategorizationRulesRoutes — MOUNTED 2026-07-30 (ACCT-LINK-06 apply-historical live ops).
  // --- Collision/unsafe: mounting duplicates an existing route -> boot crash. Do NOT mount. ---
  // ACCT-R-13 (2026-07-25): registerSettlementApprovalRoutes is now MOUNTED (index.ts) — removed
  // from this list. Its old reason ("collides with SettlementsMvp on /settlements/:id/approve") was
  // stale/imprecise even before the mount: approval.routes defines the STATIC path
  // POST /api/v1/settlements/approve (no boot-crash risk vs mvp's dynamic :id/approve — different
  // Fastify route trees), and mvp is itself unmounted, so there was never a live collision. The
  // real historical blocker was the entity-scoping gap fixed in this same PR (6 of 9 handlers
  // trusted a client-supplied operating_company_id with no membership check — see
  // docs/specs/DESIGN-settlement-approval-safe-mount-HOLD.md and
  // docs/trackers/CODER-BUILD-INSTRUCTIONS-2026-07-19.md ticket 0091-g1-3).
  // registerSettlementsMvpRoutes STAYS unmounted — verified 2026-07-25 that none of its 4 routes
  // (POST /api/v1/settlements/preview, POST /api/v1/settlements, GET /api/v1/settlements/:id/pdf,
  // POST /api/v1/settlements/:id/approve) share an exact method+path with any currently-mounted
  // route (including the now-mounted approval routes above), so "collides ... boot crash" was also
  // imprecise for this entry; the real reason to keep it unmounted is DUAL-PATH risk — it is a
  // second, independent settlement-creation/approval write path alongside the canonical
  // driver_finance settlement engine (driver-finance/settlements.routes.ts), not yet consolidated.
  // Do not mount without a dual-path consolidation decision (separate finding).
  ["registerSettlementsMvpRoutes", "UNSAFE — dual write path duplicating the canonical driver_finance settlement engine (not a boot-crash collision — re-verified 2026-07-25); keep unmounted pending consolidation"],
  // --- In-flight mount PRs (remove once merged) ---
  // --- Newly surfaced by this guard (2026-06) — backlog, not yet triaged for frontend usage.
  //     Each is genuinely unmounted (0 call sites). TODO: triage real-404-bug vs dead-code, then
  //     either mount + remove from this list, or recategorize as dead code. ---
  // registerMaintenanceCatalogRoutes: triage DONE 2026-07-25 (C10 route-manifest parity) — MOUNTED in
  // apps/backend/src/index.ts. It was never dead code: all eight catalogs (failure-codes, labor-codes,
  // parts, priority-levels, service-tasks, shop-locations, vendors, work-order-statuses) 404'd on prod
  // while apps/frontend/src/api/catalogs-maintenance.ts called them. Removed from this list because it
  // is now called; scripts/verify-route-manifest-parity.mjs pins it mounted so it cannot silently
  // regress.
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

const files = walk(SRC);
// Scope: ROUTE registrars only (the `register*Routes` convention). Middleware/hooks/gate registrars
// (registerResponseTimeMiddleware, registerObservabilitySentryHooks, registerDefaultDispatchGates,
// registerPerfMetricsRoute) use different wiring and are intentionally out of scope.
const exportRe = /export\s+(?:async\s+)?function\s+(register\w*Routes)\b/g;
const importAliasRe = /import\s*\{([^}]*)\}\s*from/g;
const aliasPairRe = /(\w+)\s+as\s+(\w+)/g;

// 1. Collect exported register* function names.
const exported = new Map(); // name -> file
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  let m;
  while ((m = exportRe.exec(txt))) exported.set(m[1], f);
}

// 2. Collect all called identifiers `ident(` and import-alias mappings (alias -> original).
const aliasToOriginal = new Map();
const calledIdents = new Set();
const callRe = /\b(\w+)\s*\(/g;
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  let im;
  while ((im = importAliasRe.exec(txt))) {
    let ap;
    while ((ap = aliasPairRe.exec(im[1]))) aliasToOriginal.set(ap[2], ap[1]);
  }
  // strip export-definition lines so a function's own definition isn't counted as a call
  const body = txt.replace(/export\s+(?:async\s+)?function\s+register\w+/g, "");
  let cm;
  while ((cm = callRe.exec(body))) calledIdents.add(cm[1]);
}

// --- @fastify/autoload false-positive class --------------------------------------------------
// apps/backend/src/index.ts calls registerAccountingRoutes(app), which (apps/backend/src/
// accounting/index.ts) runs @fastify/autoload over the whole accounting/ directory tree
// (matchFilter /\.routes\.(ts|js)$/, ignoring cash-flow/cash-forecast/finance-hub — those are
// mounted explicitly instead, see the registerAccountingRoutes call site's own comment). Autoload
// mounts a route file via its `export default fp(fn, {...})`, never by anyone writing `fn(app)`
// — so a registrar reached ONLY this way has zero call sites under the exportRe/callRe heuristic
// above and looks orphaned when it is actually live. That call site's comment names 3 real
// examples hitting exactly this (recurring-template-detail, period-close-detail,
// schedule-row-detail) after a prior boot-crash incident from mounting one of them a second time
// — do not "fix" a future one of these by adding an explicit call in index.ts.
const ACCOUNTING_AUTOLOAD_DIR = join(SRC, "accounting") + "/";
const ACCOUNTING_AUTOLOAD_IGNORE_RE = /(\.test\.|(^|\/)cash-flow\.routes\.|(^|\/)cash-forecast\.routes\.|(^|\/)finance-hub\.routes\.)/;
const fpDefaultExportRe = /export\s+default\s+fp\s*\(\s*(\w+)\b/;
const autoloadMounted = new Set();
for (const f of files) {
  if (!f.startsWith(ACCOUNTING_AUTOLOAD_DIR) || !/\.routes\.ts$/.test(f)) continue;
  if (ACCOUNTING_AUTOLOAD_IGNORE_RE.test(f)) continue;
  const m = fpDefaultExportRe.exec(readFileSync(f, "utf8"));
  if (m) autoloadMounted.add(m[1]);
}

// A register fn is "called" if its own name is called, any alias resolving to it is called, or
// @fastify/autoload mounts it via a default `fp(...)` export (see block above).
function isCalled(name) {
  if (calledIdents.has(name)) return true;
  if (autoloadMounted.has(name)) return true;
  for (const [alias, orig] of aliasToOriginal) {
    if (orig === name && calledIdents.has(alias)) return true;
  }
  return false;
}

const orphans = [...exported.keys()].filter((n) => !isCalled(n));
const unexpected = orphans.filter((n) => !ALLOWLIST.has(n));
const staleAllow = [...ALLOWLIST.keys()].filter((n) => exported.has(n) && isCalled(n));

let bad = false;
if (unexpected.length) {
  bad = true;
  console.error("verify-no-orphan-routes: ORPHANED routes (exported register*Routes never mounted):");
  for (const n of unexpected) console.error(`  ✗ ${n}  (${exported.get(n)})`);
  console.error("\nFix: register it (import + await <fn>(app) in apps/backend/src/index.ts, or a mounted aggregator),");
  console.error("or, if intentionally unmounted, add it to ALLOWLIST in scripts/verify-no-orphan-routes.mjs with a reason.");
}
if (staleAllow.length) {
  console.warn("\nverify-no-orphan-routes: NOTE — these allowlist entries are now mounted; remove them from the allowlist:");
  for (const n of staleAllow) console.warn(`  • ${n}`);
}
if (bad) process.exit(1);
console.log(`verify-no-orphan-routes: OK — ${exported.size} register*Routes, ${orphans.length} known-unmounted (allowlisted), 0 unexpected orphans.`);
