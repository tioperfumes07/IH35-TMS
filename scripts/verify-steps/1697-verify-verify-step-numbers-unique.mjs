/** LST-ORPH-04 — a duplicated step number makes the git-gate's `GUARD: scripts/verify-steps/NNN-` reference ambiguous. */
export default {
  name: "verify-verify-step-numbers-unique",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-verify-step-numbers-unique.mjs"]);
    await ctx.run("node", ["scripts/verify-verify-step-numbers-unique.mjs", "--selftest"]);
  },
};
