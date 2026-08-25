export default {
  name: "verify-pageheader-smart-back-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-pageheader-smart-back-wired.mjs"]) !== 0) {
      throw new Error("verify-pageheader-smart-back-wired failed");
    }
  },
};
