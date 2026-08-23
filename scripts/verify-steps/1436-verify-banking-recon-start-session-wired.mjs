export default {
  name: "verify-banking-recon-start-session-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-recon-start-session-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-recon-start-session-wired.mjs"]);
  },
};
