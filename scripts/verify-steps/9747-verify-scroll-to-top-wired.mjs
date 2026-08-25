export default {
  name: "verify-scroll-to-top-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-scroll-to-top-wired.mjs"]) !== 0) {
      throw new Error("verify-scroll-to-top-wired failed");
    }
  },
};
