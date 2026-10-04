export default {
  name: "verify:r342-opco-canonical-on-double-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-r342-opco-canonical-on-double-scoped.mjs"]);
  },
};
