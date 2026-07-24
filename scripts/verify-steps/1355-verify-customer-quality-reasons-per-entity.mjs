export default {
  name: "verify:customer-quality-reasons-per-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-quality-reasons-per-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-customer-quality-reasons-per-entity.mjs"]);
  },
};
