export default {
  name: "verify-inventory-purchase-ledger-sor-stock-upsert",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inventory-purchase-ledger-sor-stock-upsert.mjs"]);
  },
};
