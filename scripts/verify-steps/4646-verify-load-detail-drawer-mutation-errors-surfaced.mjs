export default {
  name: "verify-load-detail-drawer-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-load-detail-drawer-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-load-detail-drawer-mutation-errors-surfaced failed");
    }
  },
};
