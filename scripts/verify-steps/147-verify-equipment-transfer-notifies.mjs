export default {
  name: "verify-equipment-transfer-notifies",
  run(ctx) {
    const status = ctx.runAllowFailure("node", ["scripts/verify-equipment-transfer-notifies.mjs"]);
    if (status !== 0) {
      throw new Error("verify-equipment-transfer-notifies failed");
    }
  },
};
