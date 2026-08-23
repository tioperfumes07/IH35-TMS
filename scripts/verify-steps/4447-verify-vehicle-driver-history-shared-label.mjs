export default {
  name: "verify-vehicle-driver-history-shared-label",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-vehicle-driver-history-shared-label.mjs"]) !== 0) {
      throw new Error("verify-vehicle-driver-history-shared-label failed");
    }
  },
};
