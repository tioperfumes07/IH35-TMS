export default {
  name: "verify:driver-vendor-type-not-other",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-vendor-type-not-other.mjs"]);
  },
};
