#!/usr/bin/env node
/**
 * REPAIR-A regression guard — the canonical driver_finance settlement close MUST run the deduction
 * applier, gated behind the OFF flag SETTLEMENT_DEDUCTION_APPLY_ENABLED via the canonical isEnabled
 * resolver (NOT a raw lib.feature_flags read), BEFORE aggregateSettlementTotals recomputes net pay.
 *
 * Root cause it locks: the applier `applyPendingDeductionsToSettlementWithNetFloor` had NO non-test
 * caller, so cash-advance/other deductions never applied on the canonical path → drivers overpaid.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const closePath = path.join(ROOT, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts");
const capPath = path.join(ROOT, "apps/backend/src/driver-finance/settlement-deduction-cap.service.ts");
const flagsPath = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");

let failed = 0;
const fail = (m) => {
  console.error(`verify-deduction-applier-wired-into-close: ${m}`);
  failed = 1;
};

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

const close = read(closePath);
const cap = read(capPath);
const flags = read(flagsPath);

if (!close) fail("missing settlements-load-bookended.service.ts");
if (!cap) fail("missing settlement-deduction-cap.service.ts");
if (!flags) fail("missing lib/feature-flags/service.ts");

if (close && cap && flags) {
  const FLAG = "SETTLEMENT_DEDUCTION_APPLY_ENABLED";

  // 1) The close imports + calls the canonical applier.
  if (!close.includes("applyPendingDeductionsToSettlementWithNetFloor")) {
    fail("close must call applyPendingDeductionsToSettlementWithNetFloor (the applier is unwired → drivers overpaid)");
  }

  // 2) The call is gated behind isEnabled(...FLAG...), NOT a raw lib.feature_flags read (H3-4).
  if (!close.includes("isEnabled(")) fail("close must gate the applier through the canonical isEnabled() resolver");
  if (!close.includes(FLAG)) fail(`close must reference the OFF flag ${FLAG}`);
  // Detect an actual raw SQL read (SELECT ... FROM lib.feature_flags), not a prose mention in a comment.
  if (/FROM\s+lib\.feature_flags/i.test(close)) {
    fail("close must NOT read lib.feature_flags directly — use isEnabled() (H3-4 hardening)");
  }

  // 3) Ordering: applier call appears BEFORE aggregateSettlementTotals in the close body.
  //
  // ACCT-F5786 (CLS-DISPLAYID-UNSCOPED): aggregateSettlementTotals gained a 3rd operatingCompanyId
  // parameter so its own driver_settlements JOIN could carry an entity predicate -- the exact literal
  // call text changed from "aggregateSettlementTotals(client, settlementId)" to
  // "aggregateSettlementTotals(client, settlementId, opts.operatingCompanyId)". Match on the stable
  // prefix (function name + first two args) rather than the full literal, so a future signature change
  // that keeps these first two args doesn't silently re-break this guard the same way.
  const idxApplier = close.indexOf("applyPendingDeductionsToSettlementWithNetFloor(client");
  const idxAggregate = close.indexOf("aggregateSettlementTotals(client, settlementId");
  if (idxApplier < 0) fail("could not locate the applier invocation in the close");
  if (idxAggregate < 0) fail("could not locate aggregateSettlementTotals invocation in the close");
  if (idxApplier >= 0 && idxAggregate >= 0 && idxApplier > idxAggregate) {
    fail("applier must run BEFORE aggregateSettlementTotals (net pay must be recomputed AFTER deductions apply)");
  }

  // 4) Net-pay floor default is the locked 5% — the stale 50% default must be gone.
  if (/\bSETTLEMENT_MIN_NET_PCT\s*\?\?\s*50\b/.test(cap)) {
    fail("cap service still defaults the net floor to 50 — must be the locked 5% default");
  }
  if (!/DEFAULT_MIN_NET_PCT\s*=\s*5\b/.test(cap)) {
    fail("cap service must define DEFAULT_MIN_NET_PCT = 5 (locked editable 5% floor)");
  }
  // 4b) Floor stays editable/passable at apply-time.
  if (!/overrideFloor/.test(cap)) {
    fail("applier must accept an apply-time overrideFloor (5% floor is EDITABLE at apply-time)");
  }

  // 5) The flag is per-entity-only (a global default/rollout can never turn it on for all entities).
  if (!new RegExp(`PER_ENTITY_ONLY_FLAG_KEYS[\\s\\S]*"${FLAG}"`).test(flags)) {
    fail(`${FLAG} must be registered in PER_ENTITY_ONLY_FLAG_KEYS (per-entity money flag; TRANSP-first rollout)`);
  }
}

if (failed) process.exit(1);
console.log("verify-deduction-applier-wired-into-close: OK — applier wired behind OFF flag via isEnabled, before aggregate, 5% editable floor, per-entity-only.");
