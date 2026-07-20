export default {
  name: "verify:late-arrivals-error-entitylink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-late-arrivals-error-entitylink.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-late-arrivals-error-entitylink.mjs"]);
  },
};
