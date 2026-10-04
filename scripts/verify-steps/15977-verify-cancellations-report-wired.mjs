export default {
  name: "verify:cancellations-report-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancellations-report-wired.mjs"]);
  },
};
