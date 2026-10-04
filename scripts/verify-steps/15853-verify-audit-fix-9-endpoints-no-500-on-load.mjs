export default {
  name: "verify:audit-fix-9-endpoints-no-500-on-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-9-endpoints-no-500-on-load.mjs"]);
  },
};
