export default {
  name: "verify:reclassify-by-item-and-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reclassify-by-item-and-load.mjs"]);
  },
};
