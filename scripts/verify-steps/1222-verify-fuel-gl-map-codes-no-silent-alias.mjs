export default {
  name: "verify:fuel-gl-map-codes-no-silent-alias",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-gl-map-codes-no-silent-alias.mjs"]);
  },
};
