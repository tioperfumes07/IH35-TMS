export default {
  name: "verify:gl-delta-matches-matrix",
  run(ctx) {
    ctx.run("node", ["scripts/verify-gl-delta-matches-matrix.mjs"]);
  },
};
