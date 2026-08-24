export default {
  name: "verify:page-header-title-actions-no-overlap",
  run(ctx) {
    ctx.run("node", ["scripts/verify-page-header-title-actions-no-overlap.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-page-header-title-actions-no-overlap.mjs"]);
  },
};
