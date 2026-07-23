export default {
  name: "verify:fixed-assets-entitylink-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fixed-assets-entitylink-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fixed-assets-entitylink-reverse.mjs"]);
  },
};
