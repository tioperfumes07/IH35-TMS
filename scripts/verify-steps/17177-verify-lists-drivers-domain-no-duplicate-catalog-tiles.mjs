export default {
  name: "verify:lists-drivers-domain-no-duplicate-catalog-tiles",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-drivers-domain-no-duplicate-catalog-tiles.mjs"]);
  },
};
