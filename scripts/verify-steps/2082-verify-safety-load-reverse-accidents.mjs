export default {
  name: "verify-safety-load-reverse-accidents",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-safety-load-reverse-accidents.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-load-reverse-accidents.mjs"]);
  },
};
