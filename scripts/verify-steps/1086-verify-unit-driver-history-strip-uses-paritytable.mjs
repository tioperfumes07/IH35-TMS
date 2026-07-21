export default {
  name: "verify:unit-driver-history-strip-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-driver-history-strip-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unit-driver-history-strip-uses-paritytable.mjs"]);
  },
};
