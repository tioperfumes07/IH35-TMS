/**
 * Lead ruling 4-of-4 (2026-09-22, docs/bus/INBOX-CC-1.md): "THE txn_% FUEL GUARD AS A
 * SHRINK-ONLY RATCHET, BASELINE 76. 76 rows exist today. Ship it as a hard zero and you
 * freeze every push exactly like parity is doing now." Runs correctly via
 * money-pr-local-gate.mjs on every push; wired here too per the orphan-guard-registry
 * lesson from this same session (a guard that only runs pre-push is not CI coverage).
 * Verify-step 11581, CC-1 band.
 */
export default {
  name: "verify-fuel-relay-txn-vendor-unmatched",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-relay-txn-vendor-unmatched.mjs"]);
  },
};
