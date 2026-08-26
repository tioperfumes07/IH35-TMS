export default {
  name: "verify-driver-ops-history-enum-humanized",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-ops-history-enum-humanized.mjs"]) !== 0) {
      throw new Error("verify-driver-ops-history-enum-humanized failed");
    }
  },
};
