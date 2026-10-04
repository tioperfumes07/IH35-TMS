export default {
  name: "verify:reclassify-list-sums-to-its-balance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reclassify-list-sums-to-its-balance.mjs"]);
  },
};
