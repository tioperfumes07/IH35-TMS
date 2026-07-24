export default {
  name: "verify:catalog-default-entity-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-default-entity-resolver.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-catalog-default-entity-resolver.mjs"]);
  },
};
