export default {
  name: "verify:vendor-types-catalog",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-types-catalog.mjs"]);
  },
};
