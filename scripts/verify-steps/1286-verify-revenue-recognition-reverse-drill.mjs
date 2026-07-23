export default {
  name: "verify-revenue-recognition-reverse-drill",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-revenue-recognition-reverse-drill.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-revenue-recognition-reverse-drill.mjs", "--selftest"]);
  },
};
