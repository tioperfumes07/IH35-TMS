export default {
  name: "verify-tip-static-findings-register-sync",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-tip-static-findings-register-sync.mjs"]);
  },
};
