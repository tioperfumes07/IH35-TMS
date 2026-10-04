export default {
  name: "verify:accounting-hub-honest-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-hub-honest-labels.mjs"]);
  },
};
