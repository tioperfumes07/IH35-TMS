export default {
  name: "verify:payment-terms-posting-templates-entity-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-terms-posting-templates-entity-scoped.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-payment-terms-posting-templates-entity-scoped.mjs"]);
  },
};
