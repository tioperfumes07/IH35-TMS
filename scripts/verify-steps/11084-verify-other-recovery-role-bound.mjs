export default {
  name: "verify-other-recovery-role-bound",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-other-recovery-role-bound.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-other-recovery-role-bound.mjs"]);
  },
};
