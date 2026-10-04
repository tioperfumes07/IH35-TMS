export default {
  name: "verify:maint-convert-issue-wo-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-convert-issue-wo-company-lifecycle.mjs"]);
  },
};
