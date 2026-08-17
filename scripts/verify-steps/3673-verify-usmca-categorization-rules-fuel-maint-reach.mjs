export default {
  name: "verify:usmca-categorization-rules-fuel-maint-reach",
  run(ctx) {
    ctx.run("node", ["scripts/verify-usmca-categorization-rules-fuel-maint-reach.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-usmca-categorization-rules-fuel-maint-reach.mjs"]);
  },
};
