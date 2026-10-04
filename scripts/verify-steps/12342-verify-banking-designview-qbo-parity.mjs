export default {
  name: "verify:banking-designview-qbo-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-designview-qbo-parity.mjs"]);
    // BANK-F91446 — C-24 QBO parity tail (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c24-qbo-parity-tail.mjs", "--selftest"]);
  },
};
