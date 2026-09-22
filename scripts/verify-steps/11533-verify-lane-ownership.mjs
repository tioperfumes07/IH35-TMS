/**
 * verify:guard-wired fix — verify-lane-ownership.mjs (ROUND 29.9 owner ruling, docs/bus/LANES.md
 * seat ownership) existed and ran in money-pr-local-gate.mjs (03b) but was never wired into a
 * claimed verify-step, so it never independently ran in CI. Wraps it into the CI verify-step
 * convention (verify-step 11533, CC-1 band, claimed via PR #22165).
 *
 * No DB dependency — pure git-diff-against-LANES.md check, safe to run unconditionally in CI.
 */
export default {
  name: "verify-lane-ownership",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lane-ownership.mjs"]);
  },
};
