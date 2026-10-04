export default {
  name: "verify:factoring-batch-writes-factoring-status",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-batch-writes-factoring-status.mjs"]);
  },
};
