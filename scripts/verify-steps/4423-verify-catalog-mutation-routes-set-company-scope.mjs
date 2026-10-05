export default {
  name: "verify:catalog-mutation-routes-set-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-mutation-routes-set-company-scope.mjs"]);
  },
};
