export default {
  name: "verify:safety-dot-followup-company-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-dot-followup-company-audit.mjs"]);
  },
};
