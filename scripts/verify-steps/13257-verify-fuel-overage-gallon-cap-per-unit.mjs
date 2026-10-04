export default {
  name: "verify:fuel-overage-gallon-cap-per-unit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-overage-gallon-cap-per-unit.mjs"]);
  },
};
