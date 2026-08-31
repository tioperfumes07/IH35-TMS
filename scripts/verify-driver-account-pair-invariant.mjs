#!/usr/bin/env node
/**
 * DRIVER-CASH-ADVANCE-ESCROW-PAIR-INVARIANT (owner-locked, .claude/skills/ih35-accounting-decisions
 * L114: Cash Advance = ASSET, Escrow = LIABILITY, held-in-trust, returned 60-90d post-separation net
 * of damage/late-fee/fine). Live-verified 2026-08-31 (USMCA, project tiny-field-89581227): of 94
 * drivers scanned by the existing dry-run backfill endpoint, 73 are missing the advance sub-account
 * and 74 are missing the escrow sub-account — the pair is not universal today. This guard locks TWO
 * invariants so that gap cannot grow and cannot silently corrupt money going forward:
 *
 *   (1) the driver-hire path (drivers.routes.ts) provisions BOTH sub-accounts together, in one
 *       best-effort block — never one without an attempt at the other. Static/source check only;
 *       the live backlog of 73/74 pre-existing drivers is a data-completeness gap, not a code gap,
 *       and its backfill is explicitly gated behind STOP-DECISION #2 (driver-subaccount-backfill.
 *       routes.ts's own comment: "the write run is Jorge's explicit manual go with his spreadsheet")
 *       — this guard does NOT assert live-data completeness, only that the write path is correct.
 *   (2) every code path that POSTS an escrow-affecting entry against a specific driver
 *       (settlement-payrun-close.service.ts, escrow-forfeit.service.ts) resolves the driver's bound
 *       escrow LIABILITY account through the shared, fail-loud resolveDriverEscrowLiabilityAccount
 *       (which throws DRIVER_ESCROW_ACCOUNT_UNBOUND when the driver has none) — never a raw/ad-hoc
 *       query that could silently post against a missing or wrong-type account.
 *
 *   node scripts/verify-driver-account-pair-invariant.mjs
 *   node scripts/verify-driver-account-pair-invariant.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-account-pair-invariant";

const ROUTES = "apps/backend/src/mdata/drivers.routes.ts";
const RESOLVER = "apps/backend/src/driver-finance/escrow-resolver.service.ts";
const PAYRUN = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const FORFEIT = "apps/backend/src/driver-finance/escrow-forfeit.service.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard({ routes, resolver, payrun, forfeit }) {
  const errs = [];

  // (1) hire path calls BOTH provisioners inside the same best-effort block.
  if (!routes?.includes("provisionDriverAdvanceSubAccount(")) {
    errs.push(`${ROUTES}: hire path must call provisionDriverAdvanceSubAccount`);
  }
  if (!routes?.includes("provisionDriverEscrowSubAccount(")) {
    errs.push(`${ROUTES}: hire path must call provisionDriverEscrowSubAccount`);
  }
  // Both calls must appear inside the SAME try block, not gated by two independent conditions —
  // approximated by requiring both to appear between the same "if (provisionSubAccounts)" guard and
  // its closing catch, i.e. no `catch` boundary between the two calls.
  if (routes) {
    const advIdx = routes.indexOf("provisionDriverAdvanceSubAccount(");
    const escIdx = routes.indexOf("provisionDriverEscrowSubAccount(");
    if (advIdx !== -1 && escIdx !== -1) {
      const between = advIdx < escIdx ? routes.slice(advIdx, escIdx) : routes.slice(escIdx, advIdx);
      if (/\bcatch\s*\(/.test(between)) {
        errs.push(`${ROUTES}: advance and escrow provisioning must run in the same try block — a catch boundary between them would let one succeed without the other ever being attempted`);
      }
    }
  }
  if (!routes?.includes("upsertDriverAdvanceAccountLink(") || !routes?.includes("upsertDriverEscrowAccountLink(")) {
    errs.push(`${ROUTES}: both provisioned account ids must be stored (no orphaned account with no driver link)`);
  }

  // (2) fail-loud resolver: throws when unbound, and both known posting call sites use it.
  if (!resolver?.includes("DRIVER_ESCROW_ACCOUNT_UNBOUND")) {
    errs.push(`${RESOLVER}: must fail loud with DRIVER_ESCROW_ACCOUNT_UNBOUND when a driver has no bound escrow account`);
  }
  if (!resolver?.includes("throw new EscrowResolverError")) {
    errs.push(`${RESOLVER}: unbound/wrong-type escrow accounts must throw, never resolve to a fallback`);
  }
  if (!payrun?.includes("resolveDriverEscrowLiabilityAccount(")) {
    errs.push(`${PAYRUN}: settlement pay-run close must resolve the driver's escrow account through the shared fail-loud resolver, not a raw query`);
  }
  if (!forfeit?.includes("resolveDriverEscrowLiabilityAccount(")) {
    errs.push(`${FORFEIT}: escrow forfeiture must resolve the driver's escrow account through the shared fail-loud resolver, not a raw query`);
  }

  return errs;
}

function selftest() {
  const goodRoutes = `
    if (provisionSubAccounts) {
      try {
        const advanceResult = await provisionDriverAdvanceSubAccount(client, provisionArgs);
        const escrowResult = await provisionDriverEscrowSubAccount(client, provisionArgs);
        await upsertDriverAdvanceAccountLink(client, {});
        await upsertDriverEscrowAccountLink(client, {});
      } catch (err) {}
    }
  `;
  const goodResolver = `
    throw new EscrowResolverError("DRIVER_ESCROW_ACCOUNT_UNBOUND", "no bound account");
  `;
  const goodPayrun = `const escrow = await resolveDriverEscrowLiabilityAccount(client, opco, driverId);`;
  const goodForfeit = `const escrowLiability = await resolveDriverEscrowLiabilityAccount(client, opco, driverId);`;

  const good = assertGuard({ routes: goodRoutes, resolver: goodResolver, payrun: goodPayrun, forfeit: goodForfeit });
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good (${good.length}): ${good.join("; ")}`);
    process.exit(1);
  }

  const bad1 = assertGuard({ routes: goodRoutes.replace("provisionDriverEscrowSubAccount(", "/* removed */("), resolver: goodResolver, payrun: goodPayrun, forfeit: goodForfeit });
  const bad2 = assertGuard({
    routes: `
      if (provisionSubAccounts) {
        try {
          const advanceResult = await provisionDriverAdvanceSubAccount(client, provisionArgs);
        } catch (err) {}
      }
      try {
        const escrowResult = await provisionDriverEscrowSubAccount(client, provisionArgs);
      } catch (err) {}
    `,
    resolver: goodResolver,
    payrun: goodPayrun,
    forfeit: goodForfeit,
  });
  const bad3 = assertGuard({ routes: goodRoutes, resolver: "return null; // no throw", payrun: goodPayrun, forfeit: goodForfeit });
  const bad4 = assertGuard({ routes: goodRoutes, resolver: goodResolver, payrun: `const escrow = await client.query("SELECT * FROM accounting.escrow_accounts WHERE holder_id=$1", [driverId]);`, forfeit: goodForfeit });
  const bad5 = assertGuard({ routes: goodRoutes.replace("await upsertDriverEscrowAccountLink(client, {});", ""), resolver: goodResolver, payrun: goodPayrun, forfeit: goodForfeit });

  for (const [name, res] of [
    ["bad1-no-escrow-provision-call", bad1],
    ["bad2-catch-boundary-between-calls", bad2],
    ["bad3-resolver-no-throw", bad3],
    ["bad4-payrun-bypasses-resolver", bad4],
    ["bad5-escrow-link-not-stored", bad5],
  ]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 5/5 mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const routes = read(ROUTES);
const resolver = read(RESOLVER);
const payrun = read(PAYRUN);
const forfeit = read(FORFEIT);
if ([routes, resolver, payrun, forfeit].some((f) => f == null)) {
  console.error(`[${LABEL}] FAILED — missing source file`);
  process.exit(1);
}
const errs = assertGuard({ routes, resolver, payrun, forfeit });
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — hire path provisions both sub-accounts together, deduction/forfeiture paths resolve escrow through the shared fail-loud resolver`);
