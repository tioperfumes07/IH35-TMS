export default {
  name: "verify-equipment-transfer-notifies",
  run(ctx) {
    const status = ctx.run("node", ["scripts/verify-equipment-transfer-notifies.mjs"]);
    if (status !== 0) {
      throw new Error("verify-equipment-transfer-notifies failed");
    }
  },
};
