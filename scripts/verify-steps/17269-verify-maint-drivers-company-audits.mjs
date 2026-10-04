export default {
  name: "verify:maint-drivers-company-audits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-drivers-company-audits.mjs"]);
  },
};
