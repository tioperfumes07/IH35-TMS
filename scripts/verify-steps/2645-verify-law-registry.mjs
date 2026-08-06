// PERMANENT LAW (owner-locked 2026-08-05) §2 — "LAW = ENFORCED GUARD, OR IT IS NOT LAW".
// Existence-only registry check over docs/law/LAW.json: every law registered as type='enforced' must
// name a guard file that resolves on disk. ~0.5s including the selftest, so it can be required on
// every PR without adding measurable PR time — which is what the law itself specifies.
// The selftest runs FIRST and is the proof the check can go RED: it plants an enforced law pointing at
// a non-existent guard, asserts exit 1 naming the (id, guard) pair, then restores and asserts exit 0.
export default {
  name: "verify-law-registry",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-law-registry.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-law-registry.mjs"]);
  },
};
