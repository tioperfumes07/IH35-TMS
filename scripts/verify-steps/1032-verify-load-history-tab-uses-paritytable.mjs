export default {
  name: "verify:load-history-tab-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-history-tab-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-history-tab-uses-paritytable.mjs"]);
  },
};
