export default {
  name: "verify:fuel-gl-poster-callers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-gl-poster-callers.mjs"]);
  },
};
