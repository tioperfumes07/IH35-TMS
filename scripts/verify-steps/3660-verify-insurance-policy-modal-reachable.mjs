export default {
  name: "verify-insurance-policy-modal-reachable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-insurance-policy-modal-reachable.mjs"]);
  },
};
