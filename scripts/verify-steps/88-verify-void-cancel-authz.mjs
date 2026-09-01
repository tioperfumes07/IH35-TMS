import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// [HOLD-FOR-JORGE — TIER 1] Void/cancel governance authorization must stay centralized + maker-checker safe.
//
// Jorge-locked 2026-06-29: void/cancel EXECUTORS = Owner | Administrator | Accountant (canVoidCancel);
// everyone else FILES a request an executor approves/denies (governance.void_cancel_requests). This guard
// FAILS the build if that policy is bypassed or weakened:
//   1. The shared authz helper exports canVoidCancel gated to the three executor roles.
//   2. The WO void/cancel handlers gate through the shared helper (requireVoidCancelExecutor), NOT a
//      hand-rolled role list (the old local ownerOrAdmin gate must be gone).
//   3. The governance approve route uses canVoidCancel AND blocks self-approval (cannot_decide_own_request).

const AUTHZ = "apps/backend/src/lib/authz/void-cancel-authz.ts";
const WO_ROUTES = "apps/backend/src/work-orders/work-orders.routes.ts";
const GOV_ROUTES = "apps/backend/src/governance/void-cancel-requests.routes.ts";

// G9-C3: every financial VOID endpoint must route through the shared executor guard OUTSIDE any feature
// flag (anyone could void these before). Each entry is a route file + the void route path it must guard.
// VOID-EVERYWHERE PR-3 added the bill-payment void route — it previously hand-rolled a bare
// `role !== "Owner"` check (narrower AND off-policy: the locked executor set is Owner|Administrator|
// Accountant); this guard now pins it to requireVoidCancelExecutor so that regression can't return.
const FINANCIAL_VOID_ROUTES = [
  { rel: "apps/backend/src/accounting/payments.routes.ts", route: "/api/v1/accounting/payments/:id/void" },
  { rel: "apps/backend/src/accounting/invoices.routes.ts", route: "/api/v1/accounting/invoices/:id/void" },
  { rel: "apps/backend/src/accounting/factoring-advances.routes.ts", route: "/api/v1/accounting/factoring-advances/:id/void" },
  { rel: "apps/backend/src/accounting/bills.routes.ts", route: "/api/v1/accounting/bill-payments/:id/void" },
  { rel: "apps/backend/src/accounting/bills.routes.ts", route: "/api/v1/accounting/bills/:id/void" },
  { rel: "apps/backend/src/accounting/prepaid-expenses.routes.ts", route: "/api/v1/accounting/prepaid-expenses/:id/void" },
];

function read(rel) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) {
    console.error(`verify-void-cancel-authz FAILED — missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(file, "utf8");
}

function requireAll(rel, src, tokens) {
  const missing = tokens.filter(({ token }) => !src.includes(token));
  if (missing.length) {
    console.error(
      `verify-void-cancel-authz FAILED — ${rel} dropped required void/cancel-governance wiring:\n  ` +
        missing.map((m) => `${m.token} — ${m.why}`).join("\n  ")
    );
    process.exit(1);
  }
}

export default {
  name: "verify-void-cancel-authz",
  run: async () => {
    const authz = read(AUTHZ);
    requireAll(AUTHZ, authz, [
      { token: "export function canVoidCancel", why: "single source of truth for who may void/cancel directly" },
      { token: "export async function requireVoidCancelExecutorWired", why: "PERMISSION WIRING 10.4 dual-path gate" },
      { token: "PERMISSION_MODEL_ENFORCED", why: "flag OFF preserves role-only path; ON enables has_permission" },
      { token: "identity.has_permission", why: "permission model consulted when flag ON" },
      { token: '"Owner"', why: "Owner is an executor role" },
      { token: '"Administrator"', why: "Administrator is an executor role" },
      { token: '"Accountant"', why: "Accountant is an executor role (Jorge 2026-06-29)" },
    ]);

    const wo = read(WO_ROUTES);
    requireAll(WO_ROUTES, wo, [
      { token: "requireVoidCancelExecutorWired", why: "WO void/cancel must gate via the wired canVoidCancel / has_permission helper" },
    ]);
    // The old hand-rolled gate must be GONE — no per-endpoint role list may shadow the shared policy.
    if (/function\s+ownerOrAdmin\s*\(/.test(wo)) {
      console.error(
        `verify-void-cancel-authz FAILED — ${WO_ROUTES} still defines a local ownerOrAdmin gate; ` +
          "void/cancel authorization must go through the shared canVoidCancel helper (Owner|Administrator|Accountant)."
      );
      process.exit(1);
    }

    // G9-C3 / PERMISSION WIRING 10.4: each financial void handler must call requireVoidCancelExecutorWired
    // inside withCompanyScope (withCurrentUser) before mutating data.
    for (const { rel, route } of FINANCIAL_VOID_ROUTES) {
      const src = read(rel);
      const routeIdx = src.indexOf(`"${route}"`);
      if (routeIdx === -1) {
        console.error(
          `verify-void-cancel-authz FAILED — ${rel} no longer registers the financial void route ${route}; ` +
            "the G9-C3 executor guard is anchored to it."
        );
        process.exit(1);
      }
      const after = src.slice(routeIdx);
      const guardIdx = after.indexOf("requireVoidCancelExecutorWired");
      const scopeIdx = after.indexOf("withCompanyScope(");
      if (guardIdx === -1) {
        console.error(
          `verify-void-cancel-authz FAILED — ${rel} does not guard ${route} with requireVoidCancelExecutorWired ` +
            "(Owner|Administrator|Accountant / has_permission when flag ON)."
        );
        process.exit(1);
      }
      if (scopeIdx === -1 || guardIdx < scopeIdx) {
        console.error(
          `verify-void-cancel-authz FAILED — ${rel} must call requireVoidCancelExecutorWired for ${route} ` +
            "inside withCompanyScope (withCurrentUser) before mutation work."
        );
        process.exit(1);
      }
    }

    const smoke = spawnSync("node", ["scripts/verify-permission-wiring-void-cancel.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    if (smoke.status !== 0) {
      console.error(smoke.stdout || smoke.stderr || "verify-permission-wiring-void-cancel failed");
      process.exit(smoke.status ?? 1);
    }

    const gov = read(GOV_ROUTES);
    requireAll(GOV_ROUTES, gov, [
      { token: "canVoidCancel", why: "governance approve/deny must use the shared executor check" },
      { token: "cannot_decide_own_request", why: "self-approval must be blocked (maker-checker)" },
      { token: "FOR UPDATE", why: "decisions must lock the request row" },
    ]);

    console.log(
      "verify-void-cancel-authz OK — void/cancel is centralized on canVoidCancel (Owner|Administrator|Accountant), " +
        "financial void endpoints gate through requireVoidCancelExecutorWired inside withCompanyScope, " +
        "PERMISSION_MODEL_ENFORCED OFF preserves role-only path, and the governance approve route blocks self-approval."
    );
  },
};
