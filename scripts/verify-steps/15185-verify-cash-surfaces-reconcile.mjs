export default {
  name: "verify:cash-surfaces-reconcile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-surfaces-reconcile.mjs"]);
  },
};
