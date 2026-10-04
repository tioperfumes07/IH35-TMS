export default {
  name: "verify:safety-leave-requests-exact-paging",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-leave-requests-exact-paging.mjs"]);
  },
};
