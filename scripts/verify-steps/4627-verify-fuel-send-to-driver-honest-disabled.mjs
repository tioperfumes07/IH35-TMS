export default {
  name: "verify-fuel-send-to-driver-honest-disabled",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-fuel-send-to-driver-honest-disabled.mjs"]) !== 0) {
      throw new Error("verify-fuel-send-to-driver-honest-disabled failed");
    }
  },
};
