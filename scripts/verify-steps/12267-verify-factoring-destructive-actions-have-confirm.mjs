export default {
  name: "verify:factoring-destructive-actions-have-confirm",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-destructive-actions-have-confirm.mjs"]);
  },
};
