export default {
  name: "verify:qbo-accounts-parent-first",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-accounts-parent-first.mjs"]);
  },
};
