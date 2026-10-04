export default {
  name: "verify:driver-escrow-gl-never-negative",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-escrow-gl-never-negative.mjs"]);
  },
};
