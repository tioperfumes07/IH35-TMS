export default {
  name: "verify:cash-flow-auto-opening-excludes-credit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-auto-opening-excludes-credit.mjs"]);
  },
};
