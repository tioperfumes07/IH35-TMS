export default {
  name: "verify:safety-temp-cover-exact-paging",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-temp-cover-exact-paging.mjs"]);
  },
};
