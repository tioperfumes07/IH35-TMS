export default {
  name: "verify:cc3-driver-resolution-uses-canonical-map",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cc3-driver-resolution-uses-canonical-map.mjs"]);
  },
};
