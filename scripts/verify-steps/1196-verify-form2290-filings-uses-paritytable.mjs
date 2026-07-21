export default {
  name: "verify:form2290-filings-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form2290-filings-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form2290-filings-uses-paritytable.mjs"]);
  },
};
