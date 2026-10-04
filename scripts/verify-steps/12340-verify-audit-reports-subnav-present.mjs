export default {
  name: "verify:audit-reports-subnav-present",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-reports-subnav-present.mjs"]);
  },
};
