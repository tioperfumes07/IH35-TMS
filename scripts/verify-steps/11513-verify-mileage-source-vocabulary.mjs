export default {
  name: "verify:mileage-source-vocabulary",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mileage-source-vocabulary.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-mileage-source-vocabulary.mjs"]);
  },
};
