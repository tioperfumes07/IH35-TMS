export default {
  name: "verify-driver-layover-billable-mutation-error-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-layover-billable-mutation-error-surfaced.mjs"]) !== 0) {
      throw new Error("verify-driver-layover-billable-mutation-error-surfaced failed");
    }
  },
};
