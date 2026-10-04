export default {
  name: "verify:audit-fix-14-subtabs-deep-linkable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-14-subtabs-deep-linkable.mjs"]);
  },
};
