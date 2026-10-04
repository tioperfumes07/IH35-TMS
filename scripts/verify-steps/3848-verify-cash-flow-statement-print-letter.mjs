export default {
  name: "verify-cash-flow-statement-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-flow-statement-print-letter.mjs"]);
    await ctx.run("node", ["scripts/verify-cash-flow-recourse-is-secured-borrowing.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cash-flow-recourse-is-secured-borrowing.mjs"]);
  },
};
