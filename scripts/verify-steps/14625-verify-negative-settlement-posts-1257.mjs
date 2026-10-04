export default {
  name: "verify:negative-settlement-posts-1257",
  run(ctx) {
    ctx.run("node", ["scripts/verify-negative-settlement-posts-1257.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-negative-settlement-posts-1257.mjs"]);
  },
};
