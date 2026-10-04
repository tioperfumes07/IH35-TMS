export default {
  name: "verify:maint-wo-transition-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-transition-cas.mjs"]);
  },
};
