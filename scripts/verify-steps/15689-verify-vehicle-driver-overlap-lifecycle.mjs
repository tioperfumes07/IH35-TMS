export default {
  name: "verify:vehicle-driver-overlap-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-driver-overlap-lifecycle.mjs"]);
  },
};
