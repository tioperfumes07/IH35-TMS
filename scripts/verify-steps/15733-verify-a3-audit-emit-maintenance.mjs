export default {
  name: "verify:a3-audit-emit-maintenance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-a3-audit-emit-maintenance.mjs"]);
  },
};
