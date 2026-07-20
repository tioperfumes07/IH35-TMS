export default {
  name: "verify:entity-audit-history-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-entity-audit-history-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-entity-audit-history-uses-paritytable.mjs"]);
  },
};
