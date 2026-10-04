export default {
  name: "verify:loads-mileage-columns-numeric-precision",
  run(ctx) {
    ctx.run("node", ["scripts/verify-loads-mileage-columns-numeric-precision.mjs"]);
  },
};
