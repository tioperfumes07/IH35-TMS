export default {
  name: "verify:kpi-provenance-business-language",
  run(ctx) {
    ctx.run("node", ["scripts/verify-kpi-provenance-business-language.mjs"]);
  },
};
