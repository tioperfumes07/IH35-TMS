export default {
  name: "verify:deduction-applier-wired-into-close",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deduction-applier-wired-into-close.mjs"]);
  },
};
