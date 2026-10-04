export default {
  name: "verify:maint-money-creators-reset-on-company-change",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-money-creators-reset-on-company-change.mjs"]);
  },
};
