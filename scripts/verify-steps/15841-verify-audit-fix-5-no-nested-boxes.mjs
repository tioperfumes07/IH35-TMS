export default {
  name: "verify:audit-fix-5-no-nested-boxes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-5-no-nested-boxes.mjs"]);
  },
};
