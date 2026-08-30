export default {
  name: "verify-recon-sessions-void-and-unique-period",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-recon-sessions-void-and-unique-period.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-recon-sessions-void-and-unique-period.mjs"]);
  },
};
