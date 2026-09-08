export default {
  name: "verify-bank-recon-accept-closed-session-conflict",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-recon-accept-closed-session-conflict.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-recon-accept-closed-session-conflict.mjs"]);
  },
};
