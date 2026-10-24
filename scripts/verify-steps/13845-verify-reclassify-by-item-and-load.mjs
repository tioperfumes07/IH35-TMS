export default {
  name: "verify:reclassify-by-item-and-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reclassify-by-item-and-load.mjs"]);
    // OWNER RULING 443.288-A: a receipt that moves load takes its statement card difference with it.
    ctx.run("node", ["scripts/verify-expense-family-moves-with-receipt.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-family-moves-with-receipt.mjs"]);
  },
};
