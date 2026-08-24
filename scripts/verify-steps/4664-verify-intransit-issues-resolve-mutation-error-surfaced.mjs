export default {
  name: "verify-intransit-issues-resolve-mutation-error-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-intransit-issues-resolve-mutation-error-surfaced.mjs"]) !== 0) {
      throw new Error("verify-intransit-issues-resolve-mutation-error-surfaced failed");
    }
  },
};
