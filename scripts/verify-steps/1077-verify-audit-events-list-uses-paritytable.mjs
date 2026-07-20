export default {
  name: "verify:audit-events-list-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-events-list-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-events-list-uses-paritytable.mjs"]);
  },
};
