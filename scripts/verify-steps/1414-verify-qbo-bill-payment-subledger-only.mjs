export default {
  name: "verify-qbo-bill-payment-subledger-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-bill-payment-subledger-only.mjs"]);
    await ctx.run("node", ["scripts/verify-qbo-origin-bill-payment-writers-post-native-gl.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-origin-bill-payment-writers-post-native-gl.mjs"]);
  },
};
