export default {
  name: "verify-cash-flow-report-route-fix-no-fake-zero",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-cash-flow-report-route-fix-no-fake-zero.mjs"]) !== 0) {
      throw new Error("verify-cash-flow-report-route-fix-no-fake-zero failed");
    }
  },
};
