export default {
  name: "verify:accident-wizard-fields-persisted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accident-wizard-fields-persisted.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-accident-wizard-fields-persisted.mjs"]);
  },
};
