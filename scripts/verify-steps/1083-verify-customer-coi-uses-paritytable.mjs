export default {
  name: "verify:customer-coi-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-coi-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-coi-uses-paritytable.mjs"]);
  },
};
