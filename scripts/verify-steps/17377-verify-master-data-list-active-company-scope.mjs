export default {
  name: "verify:master-data-list-active-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-master-data-list-active-company-scope.mjs"]);
  },
};
