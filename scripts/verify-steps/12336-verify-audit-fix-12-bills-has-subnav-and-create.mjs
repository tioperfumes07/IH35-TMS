export default {
  name: "verify:audit-fix-12-bills-has-subnav-and-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-12-bills-has-subnav-and-create.mjs"]);
  },
};
