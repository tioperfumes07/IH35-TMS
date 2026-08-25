export default {
  name: "verify-backarrowheader-and-accounting-back-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-backarrowheader-and-accounting-back-wired.mjs"]) !== 0) {
      throw new Error("verify-backarrowheader-and-accounting-back-wired failed");
    }
  },
};
