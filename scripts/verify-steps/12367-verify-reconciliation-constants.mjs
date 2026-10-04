export default {
  name: "verify:reconciliation-constants",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reconciliation-constants.mjs"]);
  },
};
