export default {
  name: "verify:driver-operations-depth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-operations-depth.mjs"]);
  },
};
