export default {
  name: "verify:dispatch-awaiting-unassigned-not-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-awaiting-unassigned-not-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-awaiting-unassigned-not-uuid.mjs"]);
  },
};
