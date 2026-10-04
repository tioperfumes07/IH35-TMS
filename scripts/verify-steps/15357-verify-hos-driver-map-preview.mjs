export default {
  name: "verify:hos-driver-map-preview",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-driver-map-preview.mjs"]);
  },
};
