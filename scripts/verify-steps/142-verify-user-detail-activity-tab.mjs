export default {
  name: "verify-user-detail-activity-tab",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-user-detail-activity-tab.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
