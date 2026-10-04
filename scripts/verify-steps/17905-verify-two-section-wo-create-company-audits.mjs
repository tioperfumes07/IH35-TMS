export default {
  name: "verify:two-section-wo-create-company-audits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-two-section-wo-create-company-audits.mjs"]);
  },
};
