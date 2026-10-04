export default {
  name: "verify:maint-wo-complete-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-complete-cas.mjs"]);
  },
};
