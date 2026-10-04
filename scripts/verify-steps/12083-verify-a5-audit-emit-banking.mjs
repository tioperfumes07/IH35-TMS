export default {
  name: "verify:a5-audit-emit-banking",
  run(ctx) {
    ctx.run("node", ["scripts/verify-a5-audit-emit-banking.mjs"]);
  },
};
