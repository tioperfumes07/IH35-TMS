export default {
  name: "verify:driver-assignment-history-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-assignment-history-range.mjs"]);
  },
};
