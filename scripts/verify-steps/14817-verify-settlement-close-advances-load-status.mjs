export default {
  name: "verify:settlement-close-advances-load-status",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-close-advances-load-status.mjs"]);
  },
};
