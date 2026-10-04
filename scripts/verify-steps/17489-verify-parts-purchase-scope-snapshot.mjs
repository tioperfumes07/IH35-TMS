export default {
  name: "verify:parts-purchase-scope-snapshot",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parts-purchase-scope-snapshot.mjs"]);
  },
};
