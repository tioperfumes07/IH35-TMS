export default {
  name: "verify:recurring-bill-list-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recurring-bill-list-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-recurring-bill-list-uses-paritytable.mjs"]);
  },
};
