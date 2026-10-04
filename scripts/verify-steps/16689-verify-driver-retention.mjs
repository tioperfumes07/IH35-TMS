export default {
  name: "verify:driver-retention",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-retention.mjs"]);
  },
};
