export default {
  name: "verify:maint-wo-edit-company-result",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-edit-company-result.mjs"]);
  },
};
