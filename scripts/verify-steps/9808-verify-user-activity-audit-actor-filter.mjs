export default {
  name: "verify-user-activity-audit-actor-filter",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-user-activity-audit-actor-filter.mjs"]) !== 0) {
      throw new Error("verify-user-activity-audit-actor-filter failed");
    }
  },
};
