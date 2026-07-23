export default {
  name: "verify:safety-entitylink-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-entitylink-reverse.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-entitylink-reverse.mjs"]);
  },
};
