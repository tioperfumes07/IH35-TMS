export default {
  name: "verify:safety-photo-comparison-exact-paging",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-photo-comparison-exact-paging.mjs"]);
  },
};
