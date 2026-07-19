export default {
  name: "verify:qbo-sync-staleness",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-qbo-sync-staleness.mjs"]) !== 0) {
      throw new Error("verify-qbo-sync-staleness failed");
    }
    if (ctx.run("node", ["scripts/verify-qbo-sync-staleness.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-qbo-sync-staleness selftest failed");
    }
  },
};
