export default {
  name: "verify-fuel-class-f5973-remainder-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-fuel-class-f5973-remainder-wired.mjs"]) !== 0) {
      throw new Error("verify-fuel-class-f5973-remainder-wired failed");
    }
  },
};
