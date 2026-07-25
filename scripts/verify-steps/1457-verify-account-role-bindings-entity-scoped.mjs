export default {
  name: "verify:account-role-bindings-entity-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-role-bindings-entity-scoped.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-account-role-bindings-entity-scoped.mjs"]);
  },
};
