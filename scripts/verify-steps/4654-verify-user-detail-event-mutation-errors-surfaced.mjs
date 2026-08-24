export default {
  name: "verify-user-detail-event-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-user-detail-event-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-user-detail-event-mutation-errors-surfaced failed");
    }
  },
};
