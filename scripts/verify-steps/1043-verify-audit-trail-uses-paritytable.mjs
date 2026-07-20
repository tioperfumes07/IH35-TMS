export default {
  name: "verify:audit-trail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-trail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-trail-uses-paritytable.mjs"]);
  },
};
