export default {
  name: "verify:one-factoring-purchase-engine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-factoring-purchase-engine.mjs"]);
  },
};
