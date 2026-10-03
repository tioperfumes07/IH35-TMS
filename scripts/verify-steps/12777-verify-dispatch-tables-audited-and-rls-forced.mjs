export default {
  name: "verify:dispatch-tables-audited-and-rls-forced",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-tables-audited-and-rls-forced.mjs"]);
  },
};
