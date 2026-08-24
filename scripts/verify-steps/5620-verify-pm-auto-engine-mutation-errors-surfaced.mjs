export default {
  name: "verify-pm-auto-engine-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-pm-auto-engine-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-pm-auto-engine-mutation-errors-surfaced failed");
    }
  },
};
