export default {
  name: "verify:maint-wo-status-close-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-status-close-parity.mjs"]);
  },
};
