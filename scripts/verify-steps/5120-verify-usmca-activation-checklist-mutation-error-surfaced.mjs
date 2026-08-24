export default {
  name: "verify-usmca-activation-checklist-mutation-error-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-usmca-activation-checklist-mutation-error-surfaced.mjs"]) !== 0) {
      throw new Error("verify-usmca-activation-checklist-mutation-error-surfaced failed");
    }
  },
};
