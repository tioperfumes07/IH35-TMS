export default {
  name: "verify:position-history-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-position-history-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-position-history-uses-paritytable.mjs"]);
  },
};
