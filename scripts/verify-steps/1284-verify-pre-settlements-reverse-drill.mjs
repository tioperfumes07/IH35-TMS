export default {
  name: "verify-pre-settlements-reverse-drill",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-pre-settlements-reverse-drill.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-pre-settlements-reverse-drill.mjs", "--selftest"]);
  },
};
