export default {
  name: "verify-driver-scheduler-leave-enum-humanized",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-scheduler-leave-enum-humanized.mjs"]) !== 0) {
      throw new Error("verify-driver-scheduler-leave-enum-humanized failed");
    }
  },
};
