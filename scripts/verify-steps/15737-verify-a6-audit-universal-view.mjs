export default {
  name: "verify:a6-audit-universal-view",
  run(ctx) {
    ctx.run("node", ["scripts/verify-a6-audit-universal-view.mjs"]);
  },
};
