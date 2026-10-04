export default {
  name: "verify:vehicle-driver-history-exact-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-driver-history-exact-range.mjs"]);
  },
};
