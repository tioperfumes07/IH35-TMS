export default {
  name: "verify-account-register-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-account-register-print-letter.mjs"]);
  },
};
