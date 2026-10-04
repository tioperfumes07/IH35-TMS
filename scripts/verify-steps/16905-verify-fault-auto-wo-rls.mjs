export default {
  name: "verify:fault-auto-wo-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fault-auto-wo-rls.mjs"]);
  },
};
