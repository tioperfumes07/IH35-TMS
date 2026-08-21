export default {
  name: "verify:parts-inventory-purchase-on-conflict-matches-index",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parts-inventory-purchase-on-conflict-matches-index.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-parts-inventory-purchase-on-conflict-matches-index.mjs"]);
  },
};
