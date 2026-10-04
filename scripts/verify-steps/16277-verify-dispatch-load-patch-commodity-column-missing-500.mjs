export default {
  name: "verify:dispatch-load-patch-commodity-column-missing-500",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-load-patch-commodity-column-missing-500.mjs"]);
  },
};
