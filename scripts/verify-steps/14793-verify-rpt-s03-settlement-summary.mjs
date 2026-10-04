export default {
  name: "verify:rpt-s03-settlement-summary",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rpt-s03-settlement-summary.mjs"]);
  },
};
