export default {
  name: "verify:audit-fix-7-blank-pages-have-content",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-7-blank-pages-have-content.mjs"]);
  },
};
