export default {
  name: "verify-reserve-dashboard-no-double-pagination",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-reserve-dashboard-no-double-pagination.mjs"]) !== 0) {
      throw new Error("verify-reserve-dashboard-no-double-pagination failed");
    }
  },
};
