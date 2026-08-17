export default {
  name: "verify-reports-ifta-runner-canonical-alias",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-ifta-runner-canonical-alias.mjs"]);
  },
};
