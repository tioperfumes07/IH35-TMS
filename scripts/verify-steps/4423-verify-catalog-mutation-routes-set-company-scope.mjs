export default {
  name: "verify-catalog-mutation-routes-set-company-scope",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-catalog-mutation-routes-set-company-scope.mjs"]) !== 0) {
      throw new Error("verify-catalog-mutation-routes-set-company-scope failed");
    }
  },
};
