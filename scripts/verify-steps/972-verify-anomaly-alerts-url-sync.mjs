export default {
  name: "verify-anomaly-alerts-url-sync",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-anomaly-alerts-url-sync.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
