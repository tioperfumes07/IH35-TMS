import fs from "node:fs";
import path from "node:path";

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
      { token: '"Owner"', why: "Owner is an executor role" },
      { token: '"Administrator"', why: "Administrator is an executor role" },
      { token: '"Accountant"', why: "Accountant is an executor role (Jorge 2026-06-29)" },
    ]);

    const wo = read(WO_ROUTES);
    requireAll(WO_ROUTES, wo, [
      { token: "requireVoidCancelExecutor", why: "WO void/cancel must gate via the shared canVoidCancel helper" },
    ]);
    // The old hand-rolled gate must be GONE — no per-endpoint role list may shadow the shared policy.
    if (/function\s+ownerOrAdmin\s*\(/.test(wo)) {
      console.error(
        `verify-void-cancel-authz FAILED — ${WO_ROUTES} still defines a local ownerOrAdmin gate; ` +
          "void/cancel authorization must go through the shared canVoidCancel helper (Owner|Administrator|Accountant)."
      );
      process.exit(1);
    }

    const gov = read(GOV_ROUTES);
    requireAll(GOV_ROUTES, gov, [
      { token: "canVoidCancel", why: "governance approve/deny must use the shared executor check" },
      { token: "cannot_decide_own_request", why: "self-approval must be blocked (maker-checker)" },
      { token: "FOR UPDATE", why: "decisions must lock the request row" },
    ]);

    console.log(
      "verify-void-cancel-authz OK — void/cancel is centralized on canVoidCancel (Owner|Administrator|Accountant) " +
        "and the governance approve route blocks self-approval."
    );
  },
};
