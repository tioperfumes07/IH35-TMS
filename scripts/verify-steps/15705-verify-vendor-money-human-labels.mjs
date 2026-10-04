export default {
  name: "verify:vendor-money-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-money-human-labels.mjs"]);
  },
};
