export default {
  name: "verify:maint-vehicles-company-audits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-vehicles-company-audits.mjs"]);
  },
};
