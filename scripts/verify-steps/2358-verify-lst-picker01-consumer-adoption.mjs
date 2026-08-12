export default {
  name: "verify-lst-picker01-consumer-adoption",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lst-picker01-consumer-adoption.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-lst-picker01-consumer-adoption.mjs"]);
  },
};
