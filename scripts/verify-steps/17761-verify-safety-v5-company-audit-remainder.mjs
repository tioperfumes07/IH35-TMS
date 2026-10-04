export default {
  name: "verify:safety-v5-company-audit-remainder",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-v5-company-audit-remainder.mjs"]);
  },
};
