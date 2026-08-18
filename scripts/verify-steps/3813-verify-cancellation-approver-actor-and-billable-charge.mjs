export default {
  name: "verify-cancellation-approver-actor-and-billable-charge",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cancellation-approver-actor-and-billable-charge.mjs"]);
  },
};
