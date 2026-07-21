export default {
  name: "verify:journal-entry-detail-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-journal-entry-detail-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-journal-entry-detail-page-uses-paritytable.mjs"]);
  },
};
