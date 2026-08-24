export default {
  name: "verify-cash-gl-setup-mutation-error-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-cash-gl-setup-mutation-error-surfaced.mjs"]) !== 0) {
      throw new Error("verify-cash-gl-setup-mutation-error-surfaced failed");
    }
  },
};
