export default {
  name: "verify:disp-s23-map-surface",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-s23-map-surface.mjs"]);
  },
};
