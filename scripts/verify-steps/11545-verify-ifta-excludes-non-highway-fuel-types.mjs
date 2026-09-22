/**
 * verify:guard-wired fix — verify-ifta-excludes-non-highway-fuel-types.mjs (Lead, IFTA-GALLONS-01,
 * PR #22171, commit 0df952f337) landed but was never wired into a claimed verify-step, so it never
 * independently ran in CI. Wraps it into the CI verify-step convention (verify-step 11545, CC-1
 * band, claimed via node scripts/claim-verify-step.mjs).
 *
 * Static guard (no DATABASE_URL, never skips per its own header) — safe to run unconditionally.
 */
export default {
  name: "verify-ifta-excludes-non-highway-fuel-types",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ifta-excludes-non-highway-fuel-types.mjs"]);
  },
};
