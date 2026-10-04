export default {
  name: "verify:maint-convert-issue-wo-draft-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-convert-issue-wo-draft-lifecycle.mjs"]);
  },
};
