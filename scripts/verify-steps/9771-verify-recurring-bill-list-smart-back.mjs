export default {
  name: "verify-recurring-bill-list-smart-back",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-recurring-bill-list-smart-back.mjs"]) !== 0) {
      throw new Error("verify-recurring-bill-list-smart-back failed");
    }
  },
};
