export default {
  name: "verify:legal-template-detail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-template-detail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-template-detail-uses-paritytable.mjs"]);
  },
};
