export default {
  name: "verify:policy-create-wizard-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-policy-create-wizard-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-policy-create-wizard-uses-paritytable.mjs"]);
  },
};
