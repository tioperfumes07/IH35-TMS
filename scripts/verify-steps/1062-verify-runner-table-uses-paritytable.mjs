export default {
  name: "verify:runner-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-runner-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-runner-table-uses-paritytable.mjs"]);
  },
};
