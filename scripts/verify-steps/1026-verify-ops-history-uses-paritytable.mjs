export default {
  name: "verify:ops-history-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ops-history-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ops-history-uses-paritytable.mjs"]);
  },
};
