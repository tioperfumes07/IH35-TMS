export default {
  name: "verify:coa-roles-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-roles-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-roles-page-uses-paritytable.mjs"]);
  },
};
