export default {
  name: "verify-driver-picker-audit-present",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-picker-audit-present.mjs"]);
  },
};
