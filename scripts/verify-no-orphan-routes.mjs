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
  ["registerAccountingReconciliationRoutes", "dead code — no frontend caller (2026-06 sweep)"],
  ["registerBrokerUpdateRoutes", "dead code — no frontend caller"],
  ["registerDamageContinuityRoutes", "dead code — no frontend caller"],
  ["registerDispatchOverrideAuditRoutes", "dead code — no frontend caller"],
  ["registerDriverAlertRoutes", "dead code — no frontend caller"],
  ["registerSafetyDocRoutes", "dead code — no frontend caller"],
  ["registerSafetyDrugPoolRoutes", "dead code — no frontend caller"],
  ["registerSamsaraMasterSyncRoutes", "dead code / admin-only — no frontend caller"],
  ["registerScheduledReportsRoutes", "dead code — no frontend caller"],
  ["registerUserLocalePreferenceRoutes", "dead code — no frontend caller"],
  ["registerUtilizationRoutes", "dead code — no frontend caller"],
  ["registerDispatchViewRoutes", "dead code — driver-PWA view; also references a non-existent evidence table (separate finding)"],
  // --- Held: money-moving / financial surface, awaiting explicit owner approval before mounting ---
  ["registerSettlementPaymentRoutes", "HELD financial — moves settlement payments; needs owner OK"],
  ["registerDriverHubRequestRoutes", "HELD financial — approves/denies cash advances; needs owner OK"],
  ["registerFactoringQueueRoutes", "HELD financial — factoring queue; needs owner OK"],
  ["registerCategorizationRulesRoutes", "HELD — banking categorization rules; owner review"],
  // --- Collision/unsafe: mounting duplicates an existing route -> boot crash. Do NOT mount. ---
  ["registerSettlementsMvpRoutes", "UNSAFE — collides with mounted settlement routes (FST_ERR_DUPLICATED_ROUTE)"],
  ["registerSettlementApprovalRoutes", "UNSAFE — collides with SettlementsMvp on /settlements/:id/approve"],
  ["registerSettlementDisputeRoutes", "UNSAFE — namespace collision with mounted settlement-disputes"],
  // --- In-flight mount PRs (remove once merged) ---
  ["registerLoadSettlementSummaryRoutes", "in-flight mount PR #988"],
  ["registerEscrowDeductionPendingRoutes", "mounted in #982 (allowlisted until local main catches up)"],
  ["registerLoadProfitabilityRoutes", "in-flight mount PR #992"],
  ["registerLoadGeofenceTimelineRoutes", "in-flight mount PR #992"],
  ["registerDriverCommunicationsRoutes", "in-flight mount PR #992"],
  ["registerMaintenancePartsMasterRoutes", "in-flight mount PR #992"],
  ["registerMaintenanceServicesCatalogRoutes", "in-flight mount PR #992"],
  ["registerDamagePhotoEvidenceRoutes", "in-flight mount PR #992"],
  ["registerEdiRoutes", "in-flight mount PR #992"],
  // --- Newly surfaced by this guard (2026-06) — backlog, not yet triaged for frontend usage.
  //     Each is genuinely unmounted (0 call sites). TODO: triage real-404-bug vs dead-code, then
  //     either mount + remove from this list, or recategorize as dead code. ---
  ["registerDispatchCatalogRoutes", "backlog — catalog aggregator, unmounted; triage pending"],
  ["registerMaintenanceCatalogRoutes", "backlog — catalog aggregator, unmounted; triage pending"],
  ["registerFuelFraudAlertRoutes", "backlog — unmounted; triage pending"],
  ["registerActiveDriverSetRoutes", "backlog — samsara, unmounted; triage pending"],
  ["registerCap12TireTreadRoutes", "backlog — samsara, unmounted; triage pending"],
  ["registerCap13BrakeWearRoutes", "backlog — samsara, unmounted; triage pending"],
  ["registerGeofenceStateMachineRoutes", "backlog — samsara, unmounted; triage pending"],
  ["registerPreFlightDvirRoutes", "backlog — unmounted; triage pending"],
  ["registerReportCategoryCatalogRoutes", "backlog — unmounted; triage pending"],
  ["registerForm425cExhibitsRoutes", "backlog — unmounted; triage pending"],
  ["registerPhotoComparisonRoutes", "backlog — unmounted; triage pending"],
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

// A register fn is "called" if its own name is called, or any alias resolving to it is called.
function isCalled(name) {
  if (calledIdents.has(name)) return true;
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
