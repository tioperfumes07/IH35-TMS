export default {
  name: "verify-invoice-send-delivery-evidence-gate",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-send-delivery-evidence-gate.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-send-delivery-evidence-gate.mjs"]);
  },
};
