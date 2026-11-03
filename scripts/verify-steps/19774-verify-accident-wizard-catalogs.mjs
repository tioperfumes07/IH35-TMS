export default {
  name: "verify:accident-wizard-catalogs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accident-wizard-catalogs.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accident-wizard-catalogs.mjs"]);
  },
};
