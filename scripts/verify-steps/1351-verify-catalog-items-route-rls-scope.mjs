export default {
  name: "verify:catalog-items-route-rls-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-items-route-rls-scope.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-catalog-items-route-rls-scope.mjs"]);
  },
};
