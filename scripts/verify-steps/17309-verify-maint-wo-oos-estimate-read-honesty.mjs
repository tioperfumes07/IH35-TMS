export default {
  name: "verify:maint-wo-oos-estimate-read-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-oos-estimate-read-honesty.mjs"]);
  },
};
